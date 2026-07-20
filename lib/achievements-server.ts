import {
  computeUnlockedAchievementIds,
  getAchievementDefinition,
  normalizeFinalNameColor,
  normalizeTrialAvatarFrame,
  type AchievementProgress,
  type FinalNameColorId,
  type TopRankBadgeId,
  type TrialAvatarFrameId,
} from "@/lib/achievements-catalog";
import { loadTopRankBadgeMap } from "@/lib/user-identity-cosmetics-server";
import { employmentCalendarMonthsSince } from "@/lib/employment-date";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { countPassedTestsForUser } from "@/lib/test-result-stats";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export type AchievementUnlockRow = {
  id: string;
  achievementId: string;
  unlockedAt: string;
};

export type UserAchievementsPayload = {
  progress: AchievementProgress;
  unlockedIds: string[];
  storedUnlocks: AchievementUnlockRow[];
  pendingNotifications: Array<{
    id: string;
    achievementId: string;
    title: string;
    body: string;
    createdAt: string;
  }>;
  cosmetics: {
    avatarFrame: TrialAvatarFrameId | null;
    nameColor: FinalNameColorId | null;
  };
  topRankBadge: TopRankBadgeId | null;
};

export async function loadUserAchievementProgress(userId: string, employmentDate: string | null) {
  const supabase = getServerSupabaseServiceClient();
  const [trialPassed, finalPassed] = await Promise.all([
    countPassedTestsForUser(supabase, userId, "trial"),
    countPassedTestsForUser(supabase, userId, "final"),
  ]);
  const progress: AchievementProgress = {
    employmentMonths: employmentCalendarMonthsSince(employmentDate),
    trialPassed,
    finalPassed,
  };
  return progress;
}

function allowedCosmeticsFromUnlocks(unlockedIds: string[]) {
  const allowedFrames = new Set(
    unlockedIds.map((id) => getAchievementDefinition(id)?.trialFrame).filter(Boolean) as TrialAvatarFrameId[],
  );
  const allowedColors = new Set(
    unlockedIds.map((id) => getAchievementDefinition(id)?.finalNameColor).filter(Boolean) as FinalNameColorId[],
  );
  return { allowedFrames, allowedColors };
}

async function reconcileAchievementCosmetics(userId: string, unlockedIds: string[]) {
  const supabase = getServerSupabaseServiceClient();
  const userQ = await supabase
    .from("app_users")
    .select("profile_cosmetic_avatar_frame,profile_cosmetic_name_color")
    .eq("id", userId)
    .maybeSingle();
  if (userQ.error || !userQ.data) return;

  const avatarFrame = normalizeTrialAvatarFrame(userQ.data.profile_cosmetic_avatar_frame);
  const nameColor = normalizeFinalNameColor(userQ.data.profile_cosmetic_name_color);
  const { allowedFrames, allowedColors } = allowedCosmeticsFromUnlocks(unlockedIds);

  const payload: Record<string, null> = {};
  if (avatarFrame && !allowedFrames.has(avatarFrame)) payload.profile_cosmetic_avatar_frame = null;
  if (nameColor && !allowedColors.has(nameColor)) payload.profile_cosmetic_name_color = null;
  if (!Object.keys(payload).length) return;

  const upd = await supabase.from("app_users").update(payload).eq("id", userId);
  if (upd.error && !isMissingColumnError(upd.error.message)) {
    throw new Error(upd.error.message);
  }
}

async function dismissRevokedAchievementNotifications(userId: string, revokedAchievementIds: string[]) {
  if (!revokedAchievementIds.length) return;
  const supabase = getServerSupabaseServiceClient();
  for (const achievementId of revokedAchievementIds) {
    const def = getAchievementDefinition(achievementId);
    if (!def) continue;
    await supabase
      .from("app_notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("kind", "achievement")
      .eq("title", `Достижение: ${def.title}`)
      .eq("is_read", false);
  }
}

export async function syncUserAchievements(userId: string, employmentDate: string | null) {
  const supabase = getServerSupabaseServiceClient();
  const progress = await loadUserAchievementProgress(userId, employmentDate);
  const unlockedIds = computeUnlockedAchievementIds(progress);

  const existingQ = await supabase
    .from("user_achievements")
    .select("id,achievement_id,unlocked_at")
    .eq("user_id", userId);
  const existingRows = existingQ.error ? [] : existingQ.data ?? [];
  const existingSet = new Set(existingRows.map((row) => String(row.achievement_id)));

  const newlyUnlocked = unlockedIds.filter((id) => !existingSet.has(id));
  const revokedRows = existingRows.filter((row) => !unlockedIds.includes(String(row.achievement_id)));
  const revokedAchievementIds = revokedRows.map((row) => String(row.achievement_id));
  const revokedRowIds = revokedRows.map((row) => String(row.id));

  if (revokedRowIds.length) {
    await supabase.from("user_achievements").delete().in("id", revokedRowIds);
    await dismissRevokedAchievementNotifications(userId, revokedAchievementIds);
    await reconcileAchievementCosmetics(userId, unlockedIds);
  }

  if (newlyUnlocked.length) {
    const insertResult = await supabase.from("user_achievements").insert(
      newlyUnlocked.map((achievementId) => ({
        user_id: userId,
        achievement_id: achievementId,
      })),
    );
    if (!insertResult.error) {
      for (const achievementId of newlyUnlocked) {
        const def = getAchievementDefinition(achievementId);
        if (!def) continue;
        let body = "Откройте настройки профиля, чтобы выбрать награду.";
        if (def.category === "final") body = "Вы можете выбрать цвет имени и позывного в профиле.";
        if (def.category === "trial") body = "Вы можете выбрать подсветку аватара в профиле.";
        await supabase.from("app_notifications").insert({
          user_id: userId,
          kind: "achievement",
          title: `Достижение: ${def.title}`,
          body,
          href: "/profile",
        });
      }
    }
  }

  return { progress, unlockedIds };
}

export async function resolveUserUnlockedAchievementIds(
  userId: string,
  employmentDate: string | null,
): Promise<string[]> {
  const progress = await loadUserAchievementProgress(userId, employmentDate);
  return computeUnlockedAchievementIds(progress);
}

export async function loadUserAchievementsState(
  userId: string,
  employmentDate: string | null,
  options: { sync?: boolean } = {},
): Promise<UserAchievementsPayload> {
  const supabase = getServerSupabaseServiceClient();
  if (options.sync === true) {
    await syncUserAchievements(userId, employmentDate);
  }

  const progress = await loadUserAchievementProgress(userId, employmentDate);
  const unlockedIds = computeUnlockedAchievementIds(progress);

  const [storedQ, notifyQ, userQ, topRankMap] = await Promise.all([
    supabase.from("user_achievements").select("id,achievement_id,unlocked_at").eq("user_id", userId),
    supabase
      .from("app_notifications")
      .select("id,title,body,created_at,kind")
      .eq("user_id", userId)
      .eq("kind", "achievement")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("app_users")
      .select("profile_cosmetic_avatar_frame,profile_cosmetic_name_color")
      .eq("id", userId)
      .maybeSingle(),
    loadTopRankBadgeMap().catch(() => new Map<string, TopRankBadgeId>()),
  ]);

  const userRow = userQ.error ? null : userQ.data;
  let avatarFrame = normalizeTrialAvatarFrame(userRow?.profile_cosmetic_avatar_frame);
  let nameColor = normalizeFinalNameColor(userRow?.profile_cosmetic_name_color);

  const { allowedFrames, allowedColors } = allowedCosmeticsFromUnlocks(unlockedIds);
  if (avatarFrame && !allowedFrames.has(avatarFrame)) avatarFrame = null;
  if (nameColor && !allowedColors.has(nameColor)) nameColor = null;

  const pendingNotifications = (notifyQ.data ?? []).map((row) => ({
    id: String(row.id),
    achievementId: "",
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
  }));

  return {
    progress,
    unlockedIds,
    storedUnlocks: (storedQ.data ?? []).map((row) => ({
      id: String(row.id),
      achievementId: String(row.achievement_id),
      unlockedAt: String(row.unlocked_at),
    })),
    pendingNotifications,
    cosmetics: { avatarFrame, nameColor },
    topRankBadge: topRankMap.get(userId) ?? null,
  };
}

export async function updateUserAchievementCosmetics(
  userId: string,
  unlockedIds: string[],
  input: { avatarFrame?: string | null; nameColor?: string | null },
) {
  const supabase = getServerSupabaseServiceClient();
  const payload: Record<string, string | null> = {};

  if (input.avatarFrame !== undefined) {
    const frame = input.avatarFrame ? normalizeTrialAvatarFrame(input.avatarFrame) : null;
    if (frame) {
      const allowed = unlockedIds.some((id) => getAchievementDefinition(id)?.trialFrame === frame);
      if (!allowed) return { ok: false as const, error: "frame_not_unlocked" };
    }
    payload.profile_cosmetic_avatar_frame = frame;
  }

  if (input.nameColor !== undefined) {
    const color = input.nameColor ? normalizeFinalNameColor(input.nameColor) : null;
    if (color) {
      const allowed = unlockedIds.some((id) => getAchievementDefinition(id)?.finalNameColor === color);
      if (!allowed) return { ok: false as const, error: "color_not_unlocked" };
    }
    payload.profile_cosmetic_name_color = color;
  }

  if (!Object.keys(payload).length) return { ok: true as const };

  const upd = await supabase.from("app_users").update(payload).eq("id", userId);
  if (upd.error) {
    if (isMissingColumnError(upd.error.message)) {
      return { ok: false as const, error: "cosmetics_columns_missing" };
    }
    return { ok: false as const, error: upd.error.message };
  }
  return { ok: true as const };
}

export async function markAchievementNotificationsRead(userId: string, notificationIds: string[]) {
  if (!notificationIds.length) return;
  const supabase = getServerSupabaseServiceClient();
  await supabase
    .from("app_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .in("id", notificationIds);
}

export async function syncUserAchievementsByUserId(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const userQ = await supabase.from("app_users").select("employment_date").eq("id", userId).maybeSingle();
  const employmentDate = userQ.data?.employment_date ? String(userQ.data.employment_date).slice(0, 10) : null;
  return syncUserAchievements(userId, employmentDate);
}

export async function loadUserUnlockedAchievementIds(userId: string): Promise<string[]> {
  const supabase = getServerSupabaseServiceClient();
  const userQ = await supabase.from("app_users").select("employment_date").eq("id", userId).maybeSingle();
  const employmentDate = userQ.data?.employment_date ? String(userQ.data.employment_date).slice(0, 10) : null;
  return resolveUserUnlockedAchievementIds(userId, employmentDate);
}

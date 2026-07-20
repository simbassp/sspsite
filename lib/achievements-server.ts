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
import { employmentDaysSince } from "@/lib/employment-date";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function employmentMonthsSince(employmentDate: string | null | undefined): number | null {
  const days = employmentDaysSince(employmentDate);
  if (days == null) return null;
  return Math.floor(days / 30);
}

async function countPassedTests(userId: string, type: "trial" | "final") {
  const supabase = getServerSupabaseServiceClient();
  const primary = await supabase
    .from("test_results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", type)
    .eq("status", "passed");
  if (!primary.error) return primary.count ?? 0;

  if (isMissingColumnError(primary.error.message)) {
    const legacy = await supabase
      .from("test_results")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("test_type", type)
      .eq("status", "passed");
    if (!legacy.error) return legacy.count ?? 0;
  }
  return 0;
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
  const [trialPassed, finalPassed] = await Promise.all([
    countPassedTests(userId, "trial"),
    countPassedTests(userId, "final"),
  ]);
  const progress: AchievementProgress = {
    employmentMonths: employmentMonthsSince(employmentDate),
    trialPassed,
    finalPassed,
  };
  return progress;
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
  if (newlyUnlocked.length) {
    await supabase.from("user_achievements").insert(
      newlyUnlocked.map((achievementId) => ({
        user_id: userId,
        achievement_id: achievementId,
      })),
    );

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

  return { progress, unlockedIds };
}

export async function loadUserAchievementsState(
  userId: string,
  employmentDate: string | null,
): Promise<UserAchievementsPayload> {
  const supabase = getServerSupabaseServiceClient();
  const { progress, unlockedIds } = await syncUserAchievements(userId, employmentDate);

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
    loadTopRankBadgeMap(),
  ]);

  const userRow = userQ.error ? null : userQ.data;
  let avatarFrame = normalizeTrialAvatarFrame(userRow?.profile_cosmetic_avatar_frame);
  let nameColor = normalizeFinalNameColor(userRow?.profile_cosmetic_name_color);

  const allowedFrames = new Set(
    unlockedIds.map((id) => getAchievementDefinition(id)?.trialFrame).filter(Boolean) as TrialAvatarFrameId[],
  );
  const allowedColors = new Set(
    unlockedIds.map((id) => getAchievementDefinition(id)?.finalNameColor).filter(Boolean) as FinalNameColorId[],
  );
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
  const storedQ = await supabase.from("user_achievements").select("achievement_id").eq("user_id", userId);
  if (storedQ.error) return [];
  return (storedQ.data ?? []).map((row) => String(row.achievement_id));
}

import {
  computeUnlockedAchievementIds,
  getAchievementDefinition,
  normalizeBankAvatarOverlay,
  normalizeFinalNameColor,
  normalizeTrialAvatarFrame,
  type AchievementProgress,
  type BankAvatarOverlayId,
  type FinalNameColorId,
  type TopRankBadgeId,
  type TrialAvatarFrameId,
} from "@/lib/achievements-catalog";
import { loadTopRankBadgeMap, fetchUserCosmeticRow } from "@/lib/user-identity-cosmetics-server";
import { employmentCalendarMonthsSince } from "@/lib/employment-date";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { countBankCompletionsForUser, countPassedTestsForUser } from "@/lib/test-result-stats";

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
    bankOverlay: BankAvatarOverlayId | null;
  };
  topRankBadge: TopRankBadgeId | null;
};

export async function loadUserAchievementProgress(userId: string, employmentDate: string | null) {
  const supabase = getServerSupabaseServiceClient();
  const [trialPassed, finalPassed, bankCompletions] = await Promise.all([
    countPassedTestsForUser(supabase, userId, "trial"),
    countPassedTestsForUser(supabase, userId, "final"),
    countBankCompletionsForUser(supabase, userId),
  ]);
  const progress: AchievementProgress = {
    employmentMonths: employmentCalendarMonthsSince(employmentDate),
    trialPassed,
    finalPassed,
    bankCompletions,
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
  const allowedOverlays = new Set(
    unlockedIds.map((id) => getAchievementDefinition(id)?.bankOverlay).filter(Boolean) as BankAvatarOverlayId[],
  );
  return { allowedFrames, allowedColors, allowedOverlays };
}

async function reconcileAchievementCosmetics(userId: string, unlockedIds: string[]) {
  const supabase = getServerSupabaseServiceClient();
  const userRow = await fetchUserCosmeticRow(supabase, userId);
  if (!Object.keys(userRow).length) return;

  const avatarFrame = normalizeTrialAvatarFrame(userRow.profile_cosmetic_avatar_frame);
  const nameColor = normalizeFinalNameColor(userRow.profile_cosmetic_name_color);
  const bankOverlay = normalizeBankAvatarOverlay(userRow.profile_cosmetic_bank_overlay);
  const { allowedFrames, allowedColors, allowedOverlays } = allowedCosmeticsFromUnlocks(unlockedIds);

  const updates: Array<{ column: string; value: null }> = [];
  if (avatarFrame && !allowedFrames.has(avatarFrame)) updates.push({ column: "profile_cosmetic_avatar_frame", value: null });
  if (nameColor && !allowedColors.has(nameColor)) updates.push({ column: "profile_cosmetic_name_color", value: null });
  if (bankOverlay && !allowedOverlays.has(bankOverlay)) updates.push({ column: "profile_cosmetic_bank_overlay", value: null });
  if (!updates.length) return;

  for (const entry of updates) {
    const upd = await supabase.from("app_users").update({ [entry.column]: entry.value }).eq("id", userId);
    if (upd.error && !isMissingColumnError(upd.error.message)) {
      throw new Error(upd.error.message);
    }
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

export async function syncUserAchievements(userId: string, _employmentDate: string | null) {
  const progress = await loadUserAchievementProgress(userId, null);
  const unlockedIds = computeUnlockedAchievementIds(progress);
  await reconcileAchievementCosmetics(userId, unlockedIds);
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

  const [notifyQ, userRow, topRankMap] = await Promise.all([
    supabase
      .from("app_notifications")
      .select("id,title,body,created_at,kind")
      .eq("user_id", userId)
      .eq("kind", "achievement")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(5),
    fetchUserCosmeticRow(supabase, userId),
    loadTopRankBadgeMap().catch(() => new Map<string, TopRankBadgeId>()),
  ]);

  let avatarFrame = normalizeTrialAvatarFrame(userRow.profile_cosmetic_avatar_frame);
  let nameColor = normalizeFinalNameColor(userRow.profile_cosmetic_name_color);
  let bankOverlay = normalizeBankAvatarOverlay(userRow.profile_cosmetic_bank_overlay);

  const { allowedFrames, allowedColors, allowedOverlays } = allowedCosmeticsFromUnlocks(unlockedIds);
  if (avatarFrame && !allowedFrames.has(avatarFrame)) avatarFrame = null;
  if (nameColor && !allowedColors.has(nameColor)) nameColor = null;
  if (bankOverlay && !allowedOverlays.has(bankOverlay)) bankOverlay = null;

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
    storedUnlocks: [],
    pendingNotifications,
    cosmetics: { avatarFrame, nameColor, bankOverlay },
    topRankBadge: topRankMap.get(userId) ?? null,
  };
}

export async function updateUserAchievementCosmetics(
  userId: string,
  unlockedIds: string[],
  input: { avatarFrame?: string | null; nameColor?: string | null; bankOverlay?: string | null },
) {
  const supabase = getServerSupabaseServiceClient();
  const updates: Array<{ column: string; value: string | null }> = [];

  if (input.avatarFrame !== undefined) {
    const frame = input.avatarFrame ? normalizeTrialAvatarFrame(input.avatarFrame) : null;
    if (input.avatarFrame && !frame) return { ok: false as const, error: "invalid_frame" };
    if (frame) {
      const allowed = unlockedIds.some((id) => getAchievementDefinition(id)?.trialFrame === frame);
      if (!allowed) return { ok: false as const, error: "frame_not_unlocked" };
    }
    updates.push({ column: "profile_cosmetic_avatar_frame", value: frame });
  }

  if (input.nameColor !== undefined) {
    const color = input.nameColor ? normalizeFinalNameColor(input.nameColor) : null;
    if (input.nameColor && !color) return { ok: false as const, error: "invalid_color" };
    if (color) {
      const allowed = unlockedIds.some((id) => getAchievementDefinition(id)?.finalNameColor === color);
      if (!allowed) return { ok: false as const, error: "color_not_unlocked" };
    }
    updates.push({ column: "profile_cosmetic_name_color", value: color });
  }

  if (input.bankOverlay !== undefined) {
    const overlay = input.bankOverlay ? normalizeBankAvatarOverlay(input.bankOverlay) : null;
    if (input.bankOverlay && !overlay) return { ok: false as const, error: "invalid_bank_overlay" };
    if (overlay) {
      const allowed = unlockedIds.some((id) => getAchievementDefinition(id)?.bankOverlay === overlay);
      if (!allowed) return { ok: false as const, error: "bank_overlay_not_unlocked" };
    }
    updates.push({ column: "profile_cosmetic_bank_overlay", value: overlay });
  }

  if (!updates.length) return { ok: true as const };

  let savedAny = false;
  let lastError: string | undefined;
  const skippedColumns: string[] = [];

  for (const entry of updates) {
    const upd = await supabase.from("app_users").update({ [entry.column]: entry.value }).eq("id", userId);
    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        skippedColumns.push(entry.column);
        continue;
      }
      lastError = upd.error.message;
      continue;
    }
    savedAny = true;
  }

  if (!savedAny) {
    if (skippedColumns.length === updates.length) {
      return { ok: false as const, error: "cosmetics_columns_missing" };
    }
    return { ok: false as const, error: lastError || "cosmetics_update_failed" };
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

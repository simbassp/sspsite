import { finalNameColorClass, normalizeBankAvatarOverlay, normalizeFinalNameColor, normalizeTrialAvatarFrame, type BankAvatarOverlayId, type FinalNameColorId, type TopRankBadgeId, type TrialAvatarFrameId } from "@/lib/achievements-catalog";
import { normalizeProfileNameColor, profileNameColorClass, type ProfileNameColorId } from "@/lib/profile-name-color";

export type UserIdentityCosmetics = {
  adminNameColor?: ProfileNameColorId | null;
  achievementNameColor?: FinalNameColorId | null;
  avatarFrame?: TrialAvatarFrameId | null;
  bankOverlay?: BankAvatarOverlayId | null;
  topRankBadge?: TopRankBadgeId | null;
};

export function resolveIdentityColorClass(c: Partial<UserIdentityCosmetics>): string {
  const achievement = c.achievementNameColor ?? null;
  if (achievement) return finalNameColorClass(achievement);
  const admin = c.adminNameColor ?? null;
  if (admin) return profileNameColorClass(admin);
  return "";
}

export function userIdentityTextColorProps(c: Partial<UserIdentityCosmetics>) {
  const achievement = c.achievementNameColor ?? null;
  if (achievement) {
    const colorClass = finalNameColorClass(achievement);
    return { nameColor: null as ProfileNameColorId | null, colorClassOverride: colorClass || undefined };
  }
  const admin = c.adminNameColor ?? null;
  if (admin) {
    return { nameColor: admin, colorClassOverride: undefined as string | undefined };
  }
  return { nameColor: null as ProfileNameColorId | null, colorClassOverride: undefined as string | undefined };
}

export function mapIdentityCosmeticsFromRow(
  row: Record<string, unknown>,
  topRankBadge: TopRankBadgeId | null = null,
): UserIdentityCosmetics {
  return {
    adminNameColor: normalizeProfileNameColor(row.profile_name_color),
    achievementNameColor: normalizeFinalNameColor(row.profile_cosmetic_name_color),
    avatarFrame: normalizeTrialAvatarFrame(row.profile_cosmetic_avatar_frame),
    bankOverlay: normalizeBankAvatarOverlay(row.profile_cosmetic_bank_overlay),
    topRankBadge,
  };
}

export function mergeIdentityCosmetics(
  base: Partial<UserIdentityCosmetics>,
  extra: Partial<UserIdentityCosmetics>,
): UserIdentityCosmetics {
  return {
    adminNameColor: extra.adminNameColor ?? base.adminNameColor ?? null,
    achievementNameColor: extra.achievementNameColor ?? base.achievementNameColor ?? null,
    avatarFrame: extra.avatarFrame ?? base.avatarFrame ?? null,
    bankOverlay: extra.bankOverlay ?? base.bankOverlay ?? null,
    topRankBadge: extra.topRankBadge ?? base.topRankBadge ?? null,
  };
}

export const IDENTITY_COSMETIC_USER_COLUMNS =
  "profile_name_color,profile_cosmetic_name_color,profile_cosmetic_avatar_frame,profile_cosmetic_bank_overlay";

/** Колонки косметики достижений без опционального bank_overlay (для fallback). */
export const ACHIEVEMENT_COSMETIC_USER_COLUMNS =
  "profile_cosmetic_avatar_frame,profile_cosmetic_name_color";

/** Админ-цвет + достижения без bank_overlay — безопасный select при частичных миграциях. */
export const RESILIENT_IDENTITY_COSMETIC_USER_COLUMNS =
  `profile_name_color,${ACHIEVEMENT_COSMETIC_USER_COLUMNS}`;

export const IDENTITY_COSMETICS_UPDATED_EVENT = "ssp:identity-cosmetics-updated";

export function dispatchIdentityCosmeticsUpdated(cosmetics: Partial<UserIdentityCosmetics>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IDENTITY_COSMETICS_UPDATED_EVENT, { detail: cosmetics }));
}

import { finalNameColorClass, normalizeFinalNameColor, normalizeTrialAvatarFrame, type FinalNameColorId, type TopRankBadgeId, type TrialAvatarFrameId } from "@/lib/achievements-catalog";
import { normalizeProfileNameColor, profileNameColorClass, type ProfileNameColorId } from "@/lib/profile-name-color";

export type UserIdentityCosmetics = {
  adminNameColor?: ProfileNameColorId | null;
  achievementNameColor?: FinalNameColorId | null;
  avatarFrame?: TrialAvatarFrameId | null;
  topRankBadge?: TopRankBadgeId | null;
};

export function resolveIdentityColorClass(c: Partial<UserIdentityCosmetics>): string {
  const admin = c.adminNameColor ?? null;
  if (admin) return profileNameColorClass(admin);
  return finalNameColorClass(c.achievementNameColor ?? null);
}

export function userIdentityTextColorProps(c: Partial<UserIdentityCosmetics>) {
  const admin = c.adminNameColor ?? null;
  if (admin) {
    return { nameColor: admin, colorClassOverride: undefined as string | undefined };
  }
  const colorClass = finalNameColorClass(c.achievementNameColor ?? null);
  return { nameColor: null as ProfileNameColorId | null, colorClassOverride: colorClass || undefined };
}

export function mapIdentityCosmeticsFromRow(
  row: Record<string, unknown>,
  topRankBadge: TopRankBadgeId | null = null,
): UserIdentityCosmetics {
  return {
    adminNameColor: normalizeProfileNameColor(row.profile_name_color),
    achievementNameColor: normalizeFinalNameColor(row.profile_cosmetic_name_color),
    avatarFrame: normalizeTrialAvatarFrame(row.profile_cosmetic_avatar_frame),
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
    topRankBadge: extra.topRankBadge ?? base.topRankBadge ?? null,
  };
}

export const IDENTITY_COSMETIC_USER_COLUMNS =
  "profile_name_color,profile_cosmetic_name_color,profile_cosmetic_avatar_frame";

export const IDENTITY_COSMETICS_UPDATED_EVENT = "ssp:identity-cosmetics-updated";

export function dispatchIdentityCosmeticsUpdated(cosmetics: Partial<UserIdentityCosmetics>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(IDENTITY_COSMETICS_UPDATED_EVENT, { detail: cosmetics }));
}

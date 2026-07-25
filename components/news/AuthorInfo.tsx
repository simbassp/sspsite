"use client";

import { getPositionBadgeClass, positionDisplayLabel } from "@/lib/position-ui";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import type { UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";

type AuthorInfoProps = {
  author?:
    | {
        id?: string | null;
        name?: string | null;
        callsign?: string | null;
        position?: string | null;
        nameColor?: import("@/lib/profile-name-color").ProfileNameColorId | null;
        cosmetics?: UserIdentityCosmetics | null;
      }
    | null;
  fallbackName?: string | null;
};

export function AuthorInfo({ author, fallbackName }: AuthorInfoProps) {
  const name = author?.name?.trim() || "";
  const callsign = author?.callsign?.trim() || "";
  const position = author?.position || null;
  const fallback = fallbackName?.trim() || "Автор не указан";

  return (
    <div className="news-author-info">
      <div className="news-author-row">
        <div className="news-author-name">
          <UserIdentityDisplay
            name={name || fallback}
            callsign={name ? callsign : callsign || undefined}
            cosmetics={
              author?.cosmetics ??
              (author?.nameColor ? { adminNameColor: author.nameColor } : null)
            }
            emptyName={fallback}
          />
        </div>
      </div>
      {position ? (
        <span className={`news-author-position admin-users-position-badge ${getPositionBadgeClass(position)}`}>
          {positionDisplayLabel(position)}
        </span>
      ) : null}
    </div>
  );
}

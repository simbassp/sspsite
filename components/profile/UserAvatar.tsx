"use client";

import { resolveAvatarDisplayUrl, getAvatarInitials } from "@/lib/avatar-display";

type UserAvatarProps = {
  name?: string | null;
  callsign?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  title?: string;
};

export function UserAvatar({
  name = "",
  callsign = "",
  avatarUrl = null,
  size = 64,
  className = "",
  title,
}: UserAvatarProps) {
  const src = resolveAvatarDisplayUrl(avatarUrl);
  const initials = getAvatarInitials(name || "", callsign || "");
  const label = title || [name, callsign].filter(Boolean).join(" ").trim() || "Профиль";

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        title={label}
        width={size}
        height={size}
        className={`user-avatar user-avatar--photo ${className}`.trim()}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`user-avatar user-avatar--initials ${className}`.trim()}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      aria-hidden={title ? undefined : true}
      title={title}
    >
      {initials}
    </span>
  );
}

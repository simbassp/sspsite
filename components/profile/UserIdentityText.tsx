import type { ElementType, ReactNode } from "react";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { profileNameColorClass } from "@/lib/profile-name-color";

export type UserIdentityParts = {
  name?: string | null;
  callsign?: string | null;
  nameColor?: ProfileNameColorId | null;
};

type UserIdentityTextProps = UserIdentityParts & {
  className?: string;
  colorClassOverride?: string;
  nameClassName?: string;
  callsignClassName?: string;
  separator?: ReactNode;
  emptyName?: string;
  as?: ElementType;
};

/** Имя и позывной с общим цветом; размер задаётся через className снаружи. */
export function UserIdentityText({
  name,
  callsign,
  nameColor,
  colorClassOverride,
  className,
  nameClassName,
  callsignClassName,
  separator = " ",
  emptyName = "—",
  as: Tag = "span",
}: UserIdentityTextProps) {
  const colorClass = colorClassOverride ?? profileNameColorClass(nameColor ?? null);
  const displayName = (name || "").trim();
  const displayCallsign = (callsign || "").trim();

  if (!displayName && !displayCallsign) {
    return <Tag className={[className, colorClass].filter(Boolean).join(" ")}>{emptyName}</Tag>;
  }

  const nameNode = displayName ? (
    colorClass || nameClassName ? (
      <span className={[nameClassName, colorClass].filter(Boolean).join(" ")}>{displayName}</span>
    ) : (
      displayName
    )
  ) : null;

  const callsignNode = displayCallsign ? (
    <span className={[callsignClassName, colorClass].filter(Boolean).join(" ")}>{displayCallsign}</span>
  ) : null;

  return (
    <Tag className={className}>
      {nameNode}
      {displayName && displayCallsign ? separator : null}
      {callsignNode}
    </Tag>
  );
}

type OnlineUserIdentity = UserIdentityParts & { id?: string };

type OnlineUsersInlineProps = {
  users: OnlineUserIdentity[];
  className?: string;
  itemClassName?: string;
};

/** Список онлайн-пользователей с цветами имён (inline, без смены размера шрифта). */
export function OnlineUsersInline({ users, className, itemClassName }: OnlineUsersInlineProps) {
  if (!users.length) return null;
  return (
    <span className={className}>
      {users.map((user, index) => (
        <span key={user.id || `${user.name}-${user.callsign}-${index}`}>
          {index > 0 ? ", " : null}
          <UserIdentityText
            name={user.name || "Пользователь"}
            callsign={user.callsign}
            nameColor={user.nameColor}
            className={itemClassName}
            emptyName="Пользователь"
          />
        </span>
      ))}
    </span>
  );
}

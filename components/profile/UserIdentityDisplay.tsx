"use client";

import { UserIdentityText, type UserIdentityParts } from "@/components/profile/UserIdentityText";
import { userIdentityTextColorProps, type UserIdentityCosmetics } from "@/lib/user-identity-cosmetics";

type UserIdentityDisplayProps = UserIdentityParts & {
  cosmetics?: Partial<UserIdentityCosmetics> | null;
  className?: string;
  nameClassName?: string;
  callsignClassName?: string;
  separator?: React.ReactNode;
  emptyName?: string;
  as?: React.ElementType;
};

/** Имя/позывной с учётом админ-цвета и цвета из достижений. */
export function UserIdentityDisplay({
  name,
  callsign,
  cosmetics,
  className,
  nameClassName,
  callsignClassName,
  separator,
  emptyName,
  as,
}: UserIdentityDisplayProps) {
  const colorProps = userIdentityTextColorProps(cosmetics ?? {});
  return (
    <UserIdentityText
      name={name}
      callsign={callsign}
      nameColor={colorProps.nameColor}
      colorClassOverride={colorProps.colorClassOverride}
      className={className}
      nameClassName={nameClassName}
      callsignClassName={callsignClassName}
      separator={separator}
      emptyName={emptyName}
      as={as}
    />
  );
}

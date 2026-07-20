import type { ReactNode } from "react";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { profileNameColorClass } from "@/lib/profile-name-color";

type ProfileNameColorTextProps = {
  color?: ProfileNameColorId | null;
  children: ReactNode;
  className?: string;
};

export function ProfileNameColorText({ color, children, className }: ProfileNameColorTextProps) {
  const colorClass = profileNameColorClass(color ?? null);
  return <span className={[className, colorClass].filter(Boolean).join(" ")}>{children}</span>;
}

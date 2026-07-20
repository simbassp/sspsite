"use client";

import type { ReactNode } from "react";

type AdminAvatarFlamesProps = {
  children: ReactNode;
  active?: boolean;
};

const FLAME_TONGUES = [
  { id: 1, left: "2px", width: 7, height: 20, rotate: -18, duration: 0.82, delay: 0 },
  { id: 2, left: "10px", width: 9, height: 26, rotate: -8, duration: 0.95, delay: 0.12 },
  { id: 3, left: "20px", width: 11, height: 32, rotate: 0, duration: 1.05, delay: 0.05 },
  { id: 4, left: "32px", width: 12, height: 34, rotate: 0, duration: 0.88, delay: 0.18 },
  { id: 5, left: "44px", width: 11, height: 30, rotate: 6, duration: 1.1, delay: 0.08 },
  { id: 6, left: "54px", width: 9, height: 24, rotate: 14, duration: 0.92, delay: 0.22 },
  { id: 7, left: "62px", width: 7, height: 18, rotate: 20, duration: 0.86, delay: 0.14 },
] as const;

/** Декоративное пламя над аватаром администратора. */
export function AdminAvatarFlames({ children, active = false }: AdminAvatarFlamesProps) {
  if (!active) return <>{children}</>;

  return (
    <div className="admin-avatar-flames">
      <div className="admin-avatar-flames__glow" aria-hidden />
      <div className="admin-avatar-flames__fire" aria-hidden>
        {FLAME_TONGUES.map((tongue) => (
          <span
            key={tongue.id}
            className="admin-avatar-flames__tongue"
            style={{
              left: tongue.left,
              width: `${tongue.width}px`,
              height: `${tongue.height}px`,
              ["--flame-base-rotate" as string]: `${tongue.rotate}deg`,
              ["--flame-dur" as string]: `${tongue.duration}s`,
              ["--flame-delay" as string]: `${tongue.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="admin-avatar-flames__avatar">{children}</div>
    </div>
  );
}

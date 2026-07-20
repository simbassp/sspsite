"use client";

import type { ReactNode } from "react";

type AdminAvatarCrownProps = {
  children: ReactNode;
  active?: boolean;
};

function AdminCrownIcon() {
  return (
    <svg viewBox="0 0 64 40" className="admin-avatar-crown__svg" aria-hidden>
      <defs>
        <linearGradient id="admin-crown-gold" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#b45309" />
          <stop offset="38%" stopColor="#f59e0b" />
          <stop offset="72%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id="admin-crown-shine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.85)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <path
        className="admin-avatar-crown__body"
        d="M6 30 L10 14 L18 22 L32 8 L46 22 L54 14 L58 30 Z"
        fill="url(#admin-crown-gold)"
        stroke="#92400e"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        className="admin-avatar-crown__band"
        d="M5 30 H59 C59 33 56 35 32 35 C8 35 5 33 5 30 Z"
        fill="#d97706"
        stroke="#92400e"
        strokeWidth="1"
      />
      <circle className="admin-avatar-crown__gem admin-avatar-crown__gem--left" cx="18" cy="22" r="2.4" fill="#fef08a" />
      <circle className="admin-avatar-crown__gem admin-avatar-crown__gem--center" cx="32" cy="12" r="3" fill="#fff7ed" />
      <circle className="admin-avatar-crown__gem admin-avatar-crown__gem--right" cx="46" cy="22" r="2.4" fill="#fef08a" />
      <path
        className="admin-avatar-crown__shine"
        d="M8 18 L56 18"
        stroke="url(#admin-crown-shine)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/** Анимированная корона над аватаром администратора. */
export function AdminAvatarCrown({ children, active = false }: AdminAvatarCrownProps) {
  if (!active) return <>{children}</>;

  return (
    <div className="admin-avatar-crown">
      <div className="admin-avatar-crown__halo" aria-hidden />
      <div className="admin-avatar-crown__icon-wrap" aria-hidden>
        <AdminCrownIcon />
        <span className="admin-avatar-crown__spark admin-avatar-crown__spark--1" />
        <span className="admin-avatar-crown__spark admin-avatar-crown__spark--2" />
        <span className="admin-avatar-crown__spark admin-avatar-crown__spark--3" />
      </div>
      <div className="admin-avatar-crown__avatar">{children}</div>
    </div>
  );
}

"use client";

import { maskEmail } from "@/lib/mask-email";

type ProfileHeroLoginBlockProps = {
  email: string;
  onChangeEmail: () => void;
  onChangePassword: () => void;
  message?: string;
};

export function ProfileHeroLoginBlock({
  email,
  onChangeEmail,
  onChangePassword,
  message,
}: ProfileHeroLoginBlockProps) {
  return (
    <div className="profile-hero-login">
      <p className="label profile-hero-login-label">Данные входа</p>
      <p className="profile-hero-login-email">{maskEmail(email)}</p>
      <div className="profile-login-row">
        <button className="btn profile-btn-with-icon profile-hero-login-btn" type="button" onClick={onChangeEmail}>
          <MailIcon />
          Сменить почту
        </button>
        <button className="btn profile-btn-with-icon profile-hero-login-btn" type="button" onClick={onChangePassword}>
          <LockIcon />
          Сменить пароль
        </button>
      </div>
      {!!message && (
        <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

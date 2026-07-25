"use client";

import type { DutyLocation } from "@/lib/types";

type ProfileDutyLocationToggleProps = {
  value: DutyLocation;
  onChange: (value: DutyLocation) => void;
  disabled?: boolean;
};

export function ProfileDutyLocationToggle({ value, onChange, disabled = false }: ProfileDutyLocationToggleProps) {
  return (
    <div className={`profile-duty-toggle profile-duty-toggle--${value}`} role="group" aria-label="Место положения">
      <span className="profile-duty-toggle__slider" aria-hidden />
      <button
        type="button"
        className={`profile-duty-option${value === "base" ? " profile-duty-option--active" : " profile-duty-option--inactive"}`}
        onClick={() => onChange("base")}
        disabled={disabled}
        aria-pressed={value === "base"}
      >
        <HomeIcon />
        Дома
      </button>
      <button
        type="button"
        className={`profile-duty-option${value === "deployment" ? " profile-duty-option--active" : " profile-duty-option--inactive"}`}
        onClick={() => onChange("deployment")}
        disabled={disabled}
        aria-pressed={value === "deployment"}
        title="Командировка"
      >
        <PlaneIcon />
        А
      </button>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 8l2-5 2 1-2 5" />
      <path d="M2 12h7l3 8 2-8h8" />
    </svg>
  );
}

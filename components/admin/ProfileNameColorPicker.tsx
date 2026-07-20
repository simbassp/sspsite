"use client";

import {
  PROFILE_NAME_COLOR_PRESETS,
  type ProfileNameColorId,
  profileNameColorClass,
} from "@/lib/profile-name-color";

type ProfileNameColorPickerProps = {
  value: ProfileNameColorId | null;
  disabled?: boolean;
  onChange: (next: ProfileNameColorId | null) => void;
};

export function ProfileNameColorPicker({ value, disabled = false, onChange }: ProfileNameColorPickerProps) {
  const active = value ?? "default";

  return (
    <div className="profile-name-color-picker">
      <p className="label" style={{ marginBottom: 8 }}>
        Цвет имени в профиле
      </p>
      <div className="profile-name-color-picker__grid" role="listbox" aria-label="Цвет имени">
        {PROFILE_NAME_COLOR_PRESETS.map((preset) => {
          const selected = active === preset.id;
          const colorClass = profileNameColorClass(preset.id === "default" ? null : preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={disabled}
              className={`profile-name-color-picker__option${selected ? " is-selected" : ""}`}
              title={preset.label}
              onClick={() => onChange(preset.id === "default" ? null : preset.id)}
            >
              <span className={`profile-name-color-picker__sample ${colorClass}`.trim()} aria-hidden>
                {preset.sample}
              </span>
              <span className="profile-name-color-picker__label">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

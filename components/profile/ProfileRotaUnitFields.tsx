"use client";

import { ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS, rotaPlatoonLabel, rotaSectionLabel } from "@/lib/personnel-catalog";
import type { RotaPlatoon, RotaSection } from "@/lib/rota-unit";
import { UnitFieldLabel } from "@/components/profile/UnitFieldLabel";

type ProfileRotaUnitFieldsProps = {
  variant: "platoon" | "section";
  platoon: RotaPlatoon | null;
  section: RotaSection | null;
  saving?: boolean;
  error?: string;
  onPlatoonChange: (value: RotaPlatoon | null) => void;
  onSectionChange: (value: RotaSection | null) => void;
};

export function ProfileRotaUnitFields({
  variant,
  platoon,
  section,
  saving = false,
  error,
  onPlatoonChange,
  onSectionChange,
}: ProfileRotaUnitFieldsProps) {
  if (variant === "platoon") {
    return (
      <div className="profile-hero-duty profile-hero-rota-platoon">
        <UnitFieldLabel kind="platoon" className="profile-hero-duty-label" />
        <select
          className="select profile-unit-select"
          value={platoon ?? ""}
          onChange={(e) => onPlatoonChange(e.target.value ? (Number(e.target.value) as RotaPlatoon) : null)}
          disabled={saving}
          aria-label="Взвод"
        >
          <option value="">Не указан</option>
          {ROTA_PLATOON_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {rotaPlatoonLabel(value)}
            </option>
          ))}
        </select>
        {error ? <p className="page-subtitle profile-hero-rota__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="profile-hero-rota profile-hero-rota--section">
      <div className="profile-hero-rota__field">
        <UnitFieldLabel kind="section" className="profile-hero-duty-label" />
        <select
          className="select profile-unit-select"
          value={section ?? ""}
          onChange={(e) => onSectionChange(e.target.value ? (Number(e.target.value) as RotaSection) : null)}
          disabled={saving}
          aria-label="Отделение"
        >
          <option value="">Не указано</option>
          {ROTA_SECTION_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {rotaSectionLabel(value)}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="page-subtitle profile-hero-rota__error" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

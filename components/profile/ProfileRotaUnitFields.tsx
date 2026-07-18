"use client";

import { ROTA_MODULE_OPTIONS, ROTA_PLATOON_OPTIONS, ROTA_SECTION_OPTIONS } from "@/lib/personnel-catalog";
import type { RotaModule, RotaPlatoon, RotaSection } from "@/lib/rota-unit";

type ProfileRotaUnitFieldsProps = {
  variant: "platoon" | "section-module";
  platoon: RotaPlatoon | null;
  section: RotaSection | null;
  module: RotaModule | null;
  saving?: boolean;
  error?: string;
  onPlatoonChange: (value: RotaPlatoon | null) => void;
  onSectionChange: (value: RotaSection | null) => void;
  onModuleChange: (value: RotaModule | null) => void;
};

export function ProfileRotaUnitFields({
  variant,
  platoon,
  section,
  module,
  saving = false,
  error,
  onPlatoonChange,
  onSectionChange,
  onModuleChange,
}: ProfileRotaUnitFieldsProps) {
  if (variant === "platoon") {
    return (
      <div className="profile-hero-duty profile-hero-rota-platoon">
        <p className="label profile-hero-duty-label">Взвод (4 рота)</p>
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
              {value} взвод
            </option>
          ))}
        </select>
        {error ? <p className="page-subtitle profile-hero-rota__error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="profile-hero-rota profile-hero-rota--section-module">
      <div className="profile-hero-rota__field">
        <p className="label profile-hero-duty-label">Отделение</p>
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
              {value} отделение
            </option>
          ))}
        </select>
      </div>
      <div className="profile-hero-rota__field">
        <p className="label profile-hero-duty-label">Модуль</p>
        <select
          className="select profile-unit-select"
          value={module ?? ""}
          onChange={(e) => onModuleChange(e.target.value ? (Number(e.target.value) as RotaModule) : null)}
          disabled={saving}
          aria-label="Модуль"
        >
          <option value="">Не указан</option>
          {ROTA_MODULE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value} модуль
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

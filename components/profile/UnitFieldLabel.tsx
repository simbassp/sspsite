"use client";

export type UnitFieldKind = "unit" | "platoon" | "section";

export const UNIT_FIELD_SHORT: Record<UnitFieldKind, string> = {
  unit: "П",
  platoon: "В",
  section: "О",
};

export const UNIT_FIELD_FULL: Record<UnitFieldKind, string> = {
  unit: "Подразделение",
  platoon: "Взвод",
  section: "Отделение",
};

type UnitFieldLabelProps = {
  kind: UnitFieldKind;
  className?: string;
};

export function UnitFieldLabel({ kind, className }: UnitFieldLabelProps) {
  return (
    <p
      className={`unit-field-label label${className ? ` ${className}` : ""}`}
      title={UNIT_FIELD_FULL[kind]}
    >
      {UNIT_FIELD_SHORT[kind]}
    </p>
  );
}

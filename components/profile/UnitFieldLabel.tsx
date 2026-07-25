"use client";

export type UnitFieldKind = "unit" | "platoon" | "section";

const FIELD_META: Record<UnitFieldKind, { short: string; full: string }> = {
  unit: { short: "Подр.", full: "Подразделение" },
  platoon: { short: "Вз.", full: "Взвод" },
  section: { short: "Отд.", full: "Отделение" },
};

type UnitFieldLabelProps = {
  kind: UnitFieldKind;
  className?: string;
};

export function UnitFieldLabel({ kind, className }: UnitFieldLabelProps) {
  const meta = FIELD_META[kind];
  return (
    <p className={`unit-field-label label${className ? ` ${className}` : ""}`} title={meta.full}>
      <UnitFieldIcon kind={kind} />
      <span>{meta.short}</span>
    </p>
  );
}

function UnitFieldIcon({ kind }: { kind: UnitFieldKind }) {
  if (kind === "unit") {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <rect x="2" y="6" width="12" height="8" rx="1.2" />
        <path d="M5 6V4.5A3 3 0 0 1 11 4.5V6" />
        <path d="M8 9v2M6.5 10h3" />
      </svg>
    );
  }
  if (kind === "platoon") {
    return (
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 12V6l5-3 5 3v6" />
        <path d="M6 12V9h4v3" />
        <path d="M8 3v2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

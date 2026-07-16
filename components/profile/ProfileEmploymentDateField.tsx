"use client";

type ProfileEmploymentDateFieldProps = {
  value: string;
  saving?: boolean;
  error?: string;
  onChange: (value: string) => void;
};

export function ProfileEmploymentDateField({
  value,
  saving = false,
  error,
  onChange,
}: ProfileEmploymentDateFieldProps) {
  return (
    <div className="profile-hero-duty profile-hero-employment">
      <p className="label profile-hero-duty-label">Трудоустройство</p>
      <input
        type="date"
        className="input profile-employment-date-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
        aria-label="Дата трудоустройства"
        max={new Date().toISOString().slice(0, 10)}
      />
      {error ? (
        <p className="page-subtitle profile-hero-employment__error" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

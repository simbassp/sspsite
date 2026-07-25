"use client";

import { useEffect, useState } from "react";
import { IconLicense } from "@/components/personnel/PersonnelIcons";
import { PERSONNEL_LICENSE_CATEGORIES, type PersonnelLicenseCategory } from "@/lib/personnel-catalog";

type ProfilePersonnelMetaFieldsProps = {
  userId: string;
  canEdit: boolean;
  licenseCategories: PersonnelLicenseCategory[];
};

export function ProfilePersonnelMetaFields({
  userId,
  canEdit,
  licenseCategories,
}: ProfilePersonnelMetaFieldsProps) {
  const [licenseDraft, setLicenseDraft] = useState<PersonnelLicenseCategory[]>(licenseCategories);
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [licenseError, setLicenseError] = useState("");

  useEffect(() => {
    setLicenseDraft(licenseCategories);
  }, [licenseCategories]);

  const saveLicenses = async (next: PersonnelLicenseCategory[]) => {
    setLicenseSaving(true);
    setLicenseError("");
    try {
      const response = await fetch("/api/profile/licenses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, categories: next }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setLicenseDraft(licenseCategories);
        setLicenseError(payload.error || "Не удалось сохранить категории прав.");
        return;
      }
    } catch {
      setLicenseDraft(licenseCategories);
      setLicenseError("Не удалось сохранить категории прав.");
    } finally {
      setLicenseSaving(false);
    }
  };

  const onToggleLicense = (category: PersonnelLicenseCategory) => {
    if (!canEdit || licenseSaving) return;
    const next = licenseDraft.includes(category)
      ? licenseDraft.filter((item) => item !== category)
      : [...licenseDraft, category];
    setLicenseDraft(next);
    void saveLicenses(next);
  };

  return (
    <div className="profile-hero-meta-fields">
      <div className="profile-hero-meta-field">
        <p className="label profile-hero-meta-label" title="Категории прав">В/У</p>
        {canEdit ? (
          <div className="profile-license-picker" role="group" aria-label="Категории прав">
            {PERSONNEL_LICENSE_CATEGORIES.map((category) => {
              const active = licenseDraft.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  className={`profile-license-picker__btn${active ? " profile-license-picker__btn--active" : ""}`}
                  aria-pressed={active}
                  disabled={licenseSaving}
                  onClick={() => onToggleLicense(category)}
                >
                  {category}
                </button>
              );
            })}
          </div>
        ) : licenseDraft.length ? (
          <div className="profile-license-picker profile-license-picker--readonly">
            {licenseDraft.map((category) => (
              <IconLicense key={category} label={category} compact />
            ))}
          </div>
        ) : (
          <p className="profile-hero-meta-empty">—</p>
        )}
        {licenseError ? <p className="profile-hero-meta-error">{licenseError}</p> : null}
      </div>
    </div>
  );
}

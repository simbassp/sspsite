"use client";

import { useEffect, useState } from "react";
import { IconLicense } from "@/components/personnel/PersonnelIcons";
import {
  PERSONNEL_BLOOD_GROUPS,
  PERSONNEL_LICENSE_CATEGORIES,
  personnelBloodGroupLabel,
  type PersonnelBloodGroup,
  type PersonnelLicenseCategory,
} from "@/lib/personnel-catalog";

type ProfilePersonnelMetaFieldsProps = {
  userId: string;
  canEdit: boolean;
  licenseCategories: PersonnelLicenseCategory[];
  bloodGroup: PersonnelBloodGroup | null;
};

export function ProfilePersonnelMetaFields({
  userId,
  canEdit,
  licenseCategories,
  bloodGroup,
}: ProfilePersonnelMetaFieldsProps) {
  const [licenseDraft, setLicenseDraft] = useState<PersonnelLicenseCategory[]>(licenseCategories);
  const [bloodDraft, setBloodDraft] = useState<PersonnelBloodGroup | "">(bloodGroup ?? "");
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [bloodSaving, setBloodSaving] = useState(false);
  const [licenseError, setLicenseError] = useState("");
  const [bloodError, setBloodError] = useState("");

  useEffect(() => {
    setLicenseDraft(licenseCategories);
  }, [licenseCategories]);

  useEffect(() => {
    setBloodDraft(bloodGroup ?? "");
  }, [bloodGroup]);

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

  const saveBloodGroup = async (next: PersonnelBloodGroup | "") => {
    setBloodSaving(true);
    setBloodError("");
    try {
      const response = await fetch("/api/profile/blood-group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, bloodGroup: next || null }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setBloodDraft(bloodGroup ?? "");
        setBloodError(payload.error || "Не удалось сохранить группу крови.");
        return;
      }
    } catch {
      setBloodDraft(bloodGroup ?? "");
      setBloodError("Не удалось сохранить группу крови.");
    } finally {
      setBloodSaving(false);
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

  const onBloodChange = (value: string) => {
    if (!canEdit || bloodSaving) return;
    const next = (value || "") as PersonnelBloodGroup | "";
    setBloodDraft(next);
    void saveBloodGroup(next);
  };

  return (
    <div className="profile-hero-meta-fields">
      <div className="profile-hero-meta-field">
        <p className="label profile-hero-meta-label">Категории прав</p>
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
          <p className="profile-hero-meta-empty">Не указаны</p>
        )}
        {licenseError ? <p className="profile-hero-meta-error">{licenseError}</p> : null}
      </div>

      <div className="profile-hero-meta-field">
        <p className="label profile-hero-meta-label">Группа крови</p>
        {canEdit ? (
          <select
            className="select profile-blood-group-select"
            value={bloodDraft}
            onChange={(e) => onBloodChange(e.target.value)}
            disabled={bloodSaving}
            aria-label="Группа крови"
          >
            <option value="">Не указана</option>
            {PERSONNEL_BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {personnelBloodGroupLabel[group]}
              </option>
            ))}
          </select>
        ) : (
          <p className="profile-hero-meta-value">
            {bloodGroup ? personnelBloodGroupLabel[bloodGroup] : "Не указана"}
          </p>
        )}
        {bloodError ? <p className="profile-hero-meta-error">{bloodError}</p> : null}
      </div>
    </div>
  );
}

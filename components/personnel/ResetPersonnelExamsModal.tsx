"use client";

import { useState } from "react";

function TrashIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{
        display: "block",
        stroke: "currentColor",
        fill: "none",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export type PersonnelExamsResetScope = "all" | "filter";

type ResetPersonnelExamsModalProps = {
  open: boolean;
  saving: boolean;
  mode: "single" | "bulk";
  userLabel?: string;
  bulkScope?: PersonnelExamsResetScope;
  filteredCount?: number;
  onBulkScopeChange?: (scope: PersonnelExamsResetScope) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export async function postResetPersonnelExams(body: {
  scope: "single" | "all" | "filter";
  userId?: string;
  platoon?: "all" | "1" | "2";
  section?: "all" | "1" | "2" | "3" | "4";
  search?: string;
}) {
  const res = await fetch("/api/admin/personnel/exams/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string; affectedUsers?: number };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || "reset_failed");
  }
  return payload.affectedUsers ?? 0;
}

export function ResetPersonnelExamsModal({
  open,
  saving,
  mode,
  userLabel,
  bulkScope = "filter",
  filteredCount = 0,
  onBulkScopeChange,
  onClose,
  onConfirm,
}: ResetPersonnelExamsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-personnel-exams-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
    >
      <article className="card" style={{ width: "min(480px, 100%)" }}>
        <div className="card-body">
          <h3 id="reset-personnel-exams-title" style={{ marginTop: 0 }}>
            Сбросить зачёты
          </h3>
          {mode === "single" ? (
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Удалить все записи зачётов
              {userLabel ? ` для ${userLabel}` : ""}. Действие необратимо.
            </p>
          ) : (
            <>
              <p className="page-subtitle" style={{ marginTop: 0 }}>
                Выберите, для кого сбросить зачёты. Все записи будут удалены без возможности восстановления.
              </p>
              <div className="form" style={{ marginTop: 12, gap: 10 }}>
                <label
                  className="profile-reset-scope-option"
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${bulkScope === "filter" ? "var(--accent)" : "var(--line)"}`,
                    background:
                      bulkScope === "filter"
                        ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="reset-exams-scope"
                    value="filter"
                    checked={bulkScope === "filter"}
                    onChange={() => onBulkScopeChange?.("filter")}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong style={{ display: "block" }}>По текущему фильтру</strong>
                    <span className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                      {filteredCount} сотрудник{filteredCount === 1 ? "" : filteredCount >= 2 && filteredCount <= 4 ? "а" : "ов"}
                    </span>
                  </span>
                </label>
                <label
                  className="profile-reset-scope-option"
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${bulkScope === "all" ? "var(--accent)" : "var(--line)"}`,
                    background:
                      bulkScope === "all"
                        ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="reset-exams-scope"
                    value="all"
                    checked={bulkScope === "all"}
                    onChange={() => onBulkScopeChange?.("all")}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong style={{ display: "block" }}>Все сотрудники 4 роты</strong>
                    <span className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                      Активные сотрудники с подразделением «4 рота»
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="btn profile-danger-btn profile-btn-with-icon"
              type="button"
              onClick={() => void onConfirm()}
              disabled={saving || (mode === "bulk" && bulkScope === "filter" && filteredCount === 0)}
              aria-busy={saving}
            >
              <TrashIcon size={18} />
              {saving ? "Сбрасываю…" : "Сбросить"}
            </button>
            <button className="btn" type="button" onClick={onClose} disabled={saving}>
              Отмена
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

export function ResetPersonnelExamsButton({
  busy,
  onClick,
  compact = false,
}: {
  busy: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      className="btn personnel-reset-exams-btn"
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? "Сбрасываю…" : compact ? "Сбросить" : "Сбросить зачёты"}
    </button>
  );
}

export function useResetPersonnelExamsModal(defaultBulkScope: PersonnelExamsResetScope = "filter") {
  const [open, setOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<PersonnelExamsResetScope>(defaultBulkScope);
  return { open, setOpen, bulkScope, setBulkScope };
}

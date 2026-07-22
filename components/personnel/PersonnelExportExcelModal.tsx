"use client";

import { useState } from "react";

export type PersonnelExcelExportScope = "all" | "filter";

type PersonnelExportExcelModalProps = {
  open: boolean;
  loading: boolean;
  bulkScope: PersonnelExcelExportScope;
  filteredCount: number;
  onBulkScopeChange: (scope: PersonnelExcelExportScope) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export async function postPersonnelExportExcel(body: {
  scope: PersonnelExcelExportScope;
  platoon?: "all" | "1" | "2";
  section?: "all" | "1" | "2" | "3" | "4";
  module?: string;
  search?: string;
  userIds?: string[];
  testDate?: string;
  examType?: string;
  examStatus?: "all" | "passed" | "failed";
  license?: string;
  trialTest?: "all" | "passed" | "failed";
  finalTest?: "all" | "passed" | "failed";
  hits?: "all" | "yes" | "no";
  premiums?: "all" | "yes" | "no";
  dutyStatus?: "all" | "base" | "deployment";
  filterLines?: string[];
}) {
  const res = await fetch("/api/admin/personnel/export-excel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 504) {
    throw new Error("gateway_timeout");
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "export_failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(disposition);
  const filename = decodeURIComponent(match?.[1] || match?.[2] || "personnel.xlsx");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function PersonnelExportExcelModal({
  open,
  loading,
  bulkScope,
  filteredCount,
  onBulkScopeChange,
  onClose,
  onConfirm,
}: PersonnelExportExcelModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-personnel-excel-title"
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
          <h3 id="export-personnel-excel-title" style={{ marginTop: 0 }}>
            Скачать Excel
          </h3>
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            Выберите, для кого сформировать выгрузку. При фильтрах по статусу, тестам, зачётам и т.п. — только
            данные по выбранным фильтрам; иначе полный профиль с графиками.
          </p>
          <div className="form" style={{ marginTop: 12, gap: 10 }}>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${bulkScope === "filter" ? "var(--accent)" : "var(--line)"}`,
                background:
                  bulkScope === "filter" ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="export-excel-scope"
                value="filter"
                checked={bulkScope === "filter"}
                onChange={() => onBulkScopeChange("filter")}
                style={{ marginTop: 3 }}
              />
              <span>
                <strong style={{ display: "block" }}>По текущему фильтру</strong>
                <span className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                  {filteredCount} сотрудник{filteredCount === 1 ? "" : filteredCount >= 2 && filteredCount <= 4 ? "а" : "ов"} — как в таблице сейчас
                </span>
              </span>
            </label>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${bulkScope === "all" ? "var(--accent)" : "var(--line)"}`,
                background: bulkScope === "all" ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="export-excel-scope"
                value="all"
                checked={bulkScope === "all"}
                onChange={() => onBulkScopeChange("all")}
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
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="btn profile-export-excel__btn"
              type="button"
              onClick={() => void onConfirm()}
              disabled={loading || (bulkScope === "filter" && filteredCount === 0)}
              aria-busy={loading}
            >
              {loading ? "Формирую…" : "Скачать"}
            </button>
            <button className="btn" type="button" onClick={onClose} disabled={loading}>
              Отмена
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

export function PersonnelExportExcelButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="btn personnel-export-excel-btn"
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? "Формирую…" : "Скачать Excel"}
    </button>
  );
}

export function usePersonnelExportExcelModal(defaultScope: PersonnelExcelExportScope = "filter") {
  const [open, setOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<PersonnelExcelExportScope>(defaultScope);
  return { open, setOpen, bulkScope, setBulkScope };
}

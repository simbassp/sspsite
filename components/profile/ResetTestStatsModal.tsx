"use client";

import { useState } from "react";
import type { TestResultsResetScope } from "@/lib/types";

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

const SCOPE_OPTIONS: Array<{ value: TestResultsResetScope; label: string; hint: string }> = [
  { value: "trial", label: "Пробные тесты", hint: "Удалит все попытки пробных тестов" },
  { value: "final", label: "Итоговые тесты", hint: "Удалит итоговые попытки и сбросит лимит" },
  { value: "all", label: "Всё", hint: "Пробные и итоговые попытки" },
];

type ResetTestStatsModalProps = {
  open: boolean;
  saving: boolean;
  scope: TestResultsResetScope;
  onScopeChange: (scope: TestResultsResetScope) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ResetTestStatsModal({
  open,
  saving,
  scope,
  onScopeChange,
  onClose,
  onConfirm,
}: ResetTestStatsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-test-stats-title"
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
          <h3 id="reset-test-stats-title" style={{ marginTop: 0 }}>
            Сбросить статистику
          </h3>
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            Выберите, какие попытки удалить. Действие необратимо.
          </p>
          <div className="form" style={{ marginTop: 12, gap: 10 }}>
            {SCOPE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="profile-reset-scope-option"
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${scope === option.value ? "var(--accent)" : "var(--line)"}`,
                  background:
                    scope === option.value
                      ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                      : "transparent",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="reset-test-scope"
                  value={option.value}
                  checked={scope === option.value}
                  onChange={() => onScopeChange(option.value)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong style={{ display: "block" }}>{option.label}</strong>
                  <span className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              className="btn profile-danger-btn profile-btn-with-icon"
              type="button"
              onClick={() => void onConfirm()}
              disabled={saving}
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

export function ResetTestStatsButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="btn profile-danger-btn profile-btn-with-icon"
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
    >
      <TrashIcon size={18} />
      {busy ? "Сбрасываю…" : "Сбросить статистику"}
    </button>
  );
}

export function useResetTestStatsModal(defaultScope: TestResultsResetScope = "all") {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<TestResultsResetScope>(defaultScope);
  return { open, setOpen, scope, setScope };
}

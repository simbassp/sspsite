"use client";

import { Pencil, Trash2 } from "lucide-react";

type ManageAction = "delete" | "update";

export type ManageEntity = "deployment" | "premium" | "medal" | "exam" | "licenses";

export async function postPersonnelManage(body: {
  action: ManageAction;
  entity: ManageEntity;
  userId: string;
  id?: string;
  examType?: string;
  data?: Record<string, unknown>;
}) {
  const res = await fetch("/api/personnel/manage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || "Не удалось сохранить изменения.");
  }
}

export function PersonnelModActions({
  onEdit,
  onDelete,
  compact = false,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`personnel-mod-actions catalog-card-actions${compact ? " personnel-mod-actions--compact" : ""}`}>
      {onEdit && (
        <button
          type="button"
          className="btn"
          style={{ width: 38, height: 34, padding: 0 }}
          title="Редактировать"
          aria-label="Редактировать"
          onClick={onEdit}
        >
          <Pencil width={18} height={18} strokeWidth={2} aria-hidden />
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger"
        style={{ width: 38, height: 34, padding: 0 }}
        title="Удалить"
        aria-label="Удалить"
        onClick={onDelete}
      >
        <Trash2 width={18} height={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

"use client";

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
}: {
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="personnel-mod-actions">
      {onEdit && (
        <button type="button" className="btn btn-sm" onClick={onEdit}>
          Изменить
        </button>
      )}
      <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
        Удалить
      </button>
    </div>
  );
}

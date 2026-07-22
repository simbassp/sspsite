"use client";

export type ResultsExportExcelBody = {
  range?: "all" | "today";
  dateFrom?: string;
  dateTo?: string;
  attemptType?: "all" | "trial" | "final";
  attemptStatus?: "all" | "passed" | "failed" | "not_started";
  search?: string;
  unit?: string;
  rotaPlatoon?: string;
  rotaSection?: string;
};

export async function postResultsExportExcel(body: ResultsExportExcelBody) {
  const res = await fetch("/api/admin/results/export-excel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 504) {
    throw new Error("gateway_timeout");
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (payload.error === "empty_export") {
      throw new Error("empty_export");
    }
    throw new Error(payload.error || "export_failed");
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(disposition);
  const filename = decodeURIComponent(match?.[1] || match?.[2] || "results.xlsx");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ResultsExportExcelButton({
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

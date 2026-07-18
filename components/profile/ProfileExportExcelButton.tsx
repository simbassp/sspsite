"use client";

import { useState } from "react";

type ProfileExportExcelButtonProps = {
  userId: string;
  className?: string;
};

export function ProfileExportExcelButton({ userId, className = "" }: ProfileExportExcelButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onDownload = async () => {
    if (!userId || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/profile/user/${encodeURIComponent(userId)}/export-excel`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "export_failed");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const match = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(disposition);
      const filename = decodeURIComponent(match?.[1] || match?.[2] || "profile.xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "export_failed";
      setError(message === "export_failed" ? "Не удалось скачать Excel." : `Не удалось скачать Excel: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`profile-export-excel ${className}`.trim()}>
      <button type="button" className="btn profile-btn-with-icon profile-export-excel__btn" onClick={() => void onDownload()} disabled={loading}>
        <DownloadIcon />
        {loading ? "Формирую…" : "Скачать Excel"}
      </button>
      {error ? (
        <p className="page-subtitle profile-export-excel__error" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </svg>
  );
}

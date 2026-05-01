export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU");
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Суммарное время тестов: секунды → сек / мин / ч+мин. */
export function formatTotalTestDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0 сек";
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s} сек`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m} мин` : `${m} мин ${r} сек`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

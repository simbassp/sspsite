const MSK_TIMEZONE = "Europe/Moscow";

function dayKeyInMsk(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toLocaleDateString("sv-SE", { timeZone: MSK_TIMEZONE });
}

function formatDayLabelInMsk(iso: string) {
  const key = dayKeyInMsk(iso);
  if (key === "unknown") return "Без даты";

  const now = new Date();
  const todayKey = now.toLocaleDateString("sv-SE", { timeZone: MSK_TIMEZONE });
  if (key === todayKey) return "Сегодня";

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = yesterday.toLocaleDateString("sv-SE", { timeZone: MSK_TIMEZONE });
  if (key === yesterdayKey) return "Вчера";

  const [year, month, day] = key.split("-");
  return `${day}.${month}.${year}`;
}

export function groupNotificationsByDay<T extends { createdAt: string }>(items: T[]) {
  const groups: Array<{ label: string; items: T[] }> = [];

  for (const item of items) {
    const key = dayKeyInMsk(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && dayKeyInMsk(last.items[0]?.createdAt ?? "") === key) {
      last.items.push(item);
      continue;
    }
    groups.push({ label: formatDayLabelInMsk(item.createdAt), items: [item] });
  }

  return groups;
}

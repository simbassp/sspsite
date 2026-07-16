/** YYYY-MM-DD для input[type=date] и API. */
export function normalizeEmploymentDateInput(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== s) return null;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) return null;
  return s;
}

export function employmentDaysSince(employmentDate: string | null | undefined): number | null {
  if (!employmentDate?.trim()) return null;
  const start = new Date(`${employmentDate.trim()}T12:00:00`);
  const now = new Date();
  return Math.max(1, Math.round((now.getTime() - start.getTime()) / 86400000));
}

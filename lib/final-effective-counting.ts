/** Первый момент текущего календарного месяца (UTC). */
export function startOfUtcMonthIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

/**
 * Нижняя граница окна учёта итоговых попыток: позже из (ручной сброс в БД | 1-е число текущего месяца UTC).
 * Раз в месяц окно обновляется само; ручной сброс админом задаёт более позднюю границу внутри месяца.
 */
export function effectiveFinalCountingFromUtc(rawAdminReset: string | null | undefined): string {
  const monthStartIso = startOfUtcMonthIso();
  const monthStartMs = new Date(monthStartIso).getTime();
  if (!rawAdminReset?.trim()) {
    return monthStartIso;
  }
  const adminMs = new Date(rawAdminReset.trim()).getTime();
  if (Number.isNaN(adminMs)) {
    return monthStartIso;
  }
  return new Date(Math.max(adminMs, monthStartMs)).toISOString();
}

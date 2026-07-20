export const FINAL_AUTO_RESET_DAY_UTC = 28;

/** Последняя автоматическая дата сброса окна попыток (UTC, 00:00). */
export function currentAutoResetStartUtcIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  if (d >= FINAL_AUTO_RESET_DAY_UTC) {
    return new Date(Date.UTC(y, m, FINAL_AUTO_RESET_DAY_UTC, 0, 0, 0, 0)).toISOString();
  }
  return new Date(Date.UTC(y, m - 1, FINAL_AUTO_RESET_DAY_UTC, 0, 0, 0, 0)).toISOString();
}

/** Следующая автоматическая дата сброса окна попыток (UTC, 00:00). */
export function nextAutoResetUtcIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const targetMonth = d >= FINAL_AUTO_RESET_DAY_UTC ? m + 1 : m;
  return new Date(Date.UTC(y, targetMonth, FINAL_AUTO_RESET_DAY_UTC, 0, 0, 0, 0)).toISOString();
}

/**
 * Нижняя граница окна учёта итоговых попыток: позже из (ручной сброс в БД | автосброс 28-го UTC).
 * Раз в месяц окно обновляется само; ручной сброс админом задаёт более позднюю границу внутри окна.
 */
export function effectiveFinalCountingFromUtc(rawAdminReset: string | null | undefined): string {
  const autoStartIso = currentAutoResetStartUtcIso();
  const autoStartMs = new Date(autoStartIso).getTime();
  if (!rawAdminReset?.trim()) {
    return autoStartIso;
  }
  const adminMs = new Date(rawAdminReset.trim()).getTime();
  if (Number.isNaN(adminMs)) {
    return autoStartIso;
  }
  return new Date(Math.max(adminMs, autoStartMs)).toISOString();
}

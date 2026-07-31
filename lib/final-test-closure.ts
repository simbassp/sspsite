export type FinalTestClosureSettings = {
  closedFrom: string | null;
  closedUntil: string | null;
  message: string | null;
};

export type FinalTestClosureStatus = {
  isClosed: boolean;
  isScheduled: boolean;
  closedFrom: string | null;
  closedUntil: string | null;
  message: string | null;
};

export const DEFAULT_FINAL_TEST_CLOSURE_MESSAGE =
  "Доступ к итоговому тесту временно закрыт администратором.";

export function evaluateFinalTestClosure(
  settings: FinalTestClosureSettings,
  now = Date.now(),
): FinalTestClosureStatus {
  const closedFrom = settings.closedFrom?.trim() || null;
  const closedUntil = settings.closedUntil?.trim() || null;
  const message = settings.message?.trim() || null;
  const fromMs = closedFrom ? new Date(closedFrom).getTime() : Number.NaN;
  const untilMs = closedUntil ? new Date(closedUntil).getTime() : Number.NaN;
  const hasFrom = Number.isFinite(fromMs);
  const hasUntil = Number.isFinite(untilMs);

  if (!hasFrom && !hasUntil) {
    return {
      isClosed: false,
      isScheduled: false,
      closedFrom,
      closedUntil,
      message,
    };
  }

  if (hasFrom && now < fromMs) {
    return {
      isClosed: false,
      isScheduled: true,
      closedFrom,
      closedUntil,
      message,
    };
  }

  if (hasFrom && !hasUntil && now >= fromMs) {
    return {
      isClosed: true,
      isScheduled: false,
      closedFrom,
      closedUntil,
      message,
    };
  }

  if (hasFrom && hasUntil) {
    const isClosed = now >= fromMs && now <= untilMs;
    return {
      isClosed,
      isScheduled: !isClosed && now < fromMs,
      closedFrom,
      closedUntil,
      message,
    };
  }

  if (!hasFrom && hasUntil && now <= untilMs) {
    return {
      isClosed: true,
      isScheduled: false,
      closedFrom,
      closedUntil,
      message,
    };
  }

  return {
    isClosed: false,
    isScheduled: false,
    closedFrom,
    closedUntil,
    message,
  };
}

export function formatFinalTestClosureMessage(status: FinalTestClosureStatus, formatDateTime: (iso: string) => string) {
  if (status.isClosed || status.isScheduled) {
    if (status.message) return status.message;
  }
  if (status.isScheduled && status.closedFrom) {
    const untilHint = status.closedUntil ? ` до ${formatDateTime(status.closedUntil)}` : "";
    return `Итоговый тест будет закрыт с ${formatDateTime(status.closedFrom)}${untilHint}.`;
  }
  if (status.isClosed) {
    if (status.closedFrom && status.closedUntil) {
      return `Итоговый тест закрыт с ${formatDateTime(status.closedFrom)} до ${formatDateTime(status.closedUntil)}.`;
    }
    if (status.closedFrom) {
      return `Итоговый тест закрыт с ${formatDateTime(status.closedFrom)}.`;
    }
    return DEFAULT_FINAL_TEST_CLOSURE_MESSAGE;
  }
  return "";
}

export function describeFinalClosureApiError(error: string | undefined) {
  switch (error) {
    case "invalid_closure_range":
      return "Дата «Закрыть до» не может быть раньше даты «Закрыть с».";
    case "invalid_closed_from":
      return "Некорректная дата в поле «Закрыть с».";
    case "invalid_closed_until":
      return "Некорректная дата в поле «Закрыть до».";
    case "closure_columns_missing":
      return "В базе нет колонок закрытия. Примените SQL-миграцию в Supabase.";
    case "forbidden":
      return "Закрытие итогового теста доступно только администратору.";
    case "unauthorized":
      return "Сессия истекла. Войдите снова.";
    default:
      return error?.trim() || "Не удалось сохранить закрытие итогового теста.";
  }
}

/** Значение для input[type=datetime-local] в локальной TZ браузера. */
export function toDatetimeLocalInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Парсинг datetime-local → ISO (UTC). */
export function fromDatetimeLocalInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

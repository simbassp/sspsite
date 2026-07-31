"use client";

import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import {
  describeFinalClosureApiError,
  fromDatetimeLocalInputValue,
  toDatetimeLocalInputValue,
  type FinalTestClosureSettings,
} from "@/lib/final-test-closure";
import { formatDateTime } from "@/lib/format";

type ClosureStatus = {
  isClosed: boolean;
  isScheduled: boolean;
  closedFrom: string | null;
  closedUntil: string | null;
  message: string | null;
};

type Props = {
  onMessage?: (text: string) => void;
};

export function FinalTestClosurePanel({ onMessage }: Props) {
  const session = useMemo(() => readClientSession(), []);
  const isAdmin = session?.role === "admin";

  const [closedFromLocal, setClosedFromLocal] = useState("");
  const [closedUntilLocal, setClosedUntilLocal] = useState("");
  const [message, setClosureMessage] = useState("");
  const [status, setStatus] = useState<ClosureStatus | null>(null);
  const [displayMessage, setDisplayMessage] = useState("");
  const [notifyUsers, setNotifyUsers] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/admin/tests/final-closure", { cache: "no-store" });
        const payload = (await res.json()) as {
          ok?: boolean;
          settings?: FinalTestClosureSettings;
          status?: ClosureStatus;
          displayMessage?: string;
        };
        if (cancelled || !res.ok || !payload.ok || !payload.settings) return;
        setClosedFromLocal(toDatetimeLocalInputValue(payload.settings.closedFrom));
        setClosedUntilLocal(toDatetimeLocalInputValue(payload.settings.closedUntil));
        setClosureMessage(payload.settings.message || "");
        setStatus(payload.status || null);
        setDisplayMessage(payload.displayMessage || "");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const save = async (options?: { clear?: boolean }) => {
    if (isSaving) return;

    if (!options?.clear) {
      if (!closedFromLocal.trim()) {
        onMessage?.("Укажите дату и время в поле «Закрыть с».");
        return;
      }
      const fromMs = new Date(closedFromLocal).getTime();
      const untilMs = closedUntilLocal.trim() ? new Date(closedUntilLocal).getTime() : Number.NaN;
      if (!Number.isFinite(fromMs)) {
        onMessage?.("Некорректная дата в поле «Закрыть с».");
        return;
      }
      if (closedUntilLocal.trim() && !Number.isFinite(untilMs)) {
        onMessage?.("Некорректная дата в поле «Закрыть до».");
        return;
      }
      if (Number.isFinite(untilMs) && untilMs < fromMs) {
        onMessage?.("Дата «Закрыть до» не может быть раньше даты «Закрыть с». Проверьте месяц и год.");
        return;
      }
    }

    setIsSaving(true);
    try {
      const closedFrom = options?.clear ? null : fromDatetimeLocalInputValue(closedFromLocal);
      const closedUntil = options?.clear ? null : fromDatetimeLocalInputValue(closedUntilLocal);
      const res = await fetch("/api/admin/tests/final-closure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clear: options?.clear === true,
          closedFrom,
          closedUntil,
          message: message.trim() || null,
          notify: options?.clear ? false : notifyUsers,
          notifyTitle: "Итоговый тест: изменение доступа",
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settings?: FinalTestClosureSettings;
        status?: ClosureStatus;
        displayMessage?: string;
        notified?: number;
      };
      if (!res.ok || !payload.ok) {
        onMessage?.(describeFinalClosureApiError(payload.error));
        return;
      }
      if (payload.settings) {
        setClosedFromLocal(toDatetimeLocalInputValue(payload.settings.closedFrom));
        setClosedUntilLocal(toDatetimeLocalInputValue(payload.settings.closedUntil));
        setClosureMessage(payload.settings.message || "");
      }
      setStatus(payload.status || null);
      setDisplayMessage(payload.displayMessage || "");
      if (options?.clear) {
        onMessage?.("Закрытие итогового теста снято.");
      } else if (payload.notified && payload.notified > 0) {
        onMessage?.(`Настройки сохранены. Оповещение отправлено (${payload.notified}).`);
      } else {
        onMessage?.("Настройки закрытия итогового теста сохранены.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const statusLabel = status?.isClosed
    ? "Закрыт сейчас"
    : status?.isScheduled
      ? "Закрытие запланировано"
      : "Открыт";

  return (
    <article className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <h3 style={{ marginTop: 0 }}>Закрытие итогового теста</h3>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          Только администратор. В указанный период новые попытки итогового теста будут недоступны. Уже начатые
          попытки можно завершить.
        </p>
        {isLoading ? (
          <p className="page-subtitle">Загрузка…</p>
        ) : (
          <>
            <p className="page-subtitle" style={{ marginTop: 0 }}>
              Статус: <strong>{statusLabel}</strong>
              {displayMessage ? <> — {displayMessage}</> : null}
            </p>
            <div className="form" style={{ display: "grid", gap: 10, maxWidth: 420 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span>Закрыть с</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={closedFromLocal}
                  onChange={(e) => setClosedFromLocal(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>Закрыть до (необязательно, можно оставить пустым)</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={closedUntilLocal}
                  onChange={(e) => setClosedUntilLocal(e.target.value)}
                />
              </label>
              <p className="page-subtitle" style={{ margin: 0, fontSize: 12 }}>
                Пример на сегодня: «Закрыть с» — 01.08.2026 00:00, «Закрыть до» — пусто (или дата позже «с»).
              </p>
              <label style={{ display: "grid", gap: 4 }}>
                <span>Сообщение пользователям</span>
                <textarea
                  className="input"
                  rows={3}
                  value={message}
                  onChange={(e) => setClosureMessage(e.target.value)}
                  placeholder="Например: итоговый тест закрыт до объявления."
                />
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={notifyUsers} onChange={(e) => setNotifyUsers(e.target.checked)} />
                <span>Оповестить всех при сохранении</span>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="button" disabled={isSaving} onClick={() => void save()}>
                {isSaving ? "Сохраняю…" : "Сохранить"}
              </button>
              <button className="btn" type="button" disabled={isSaving} onClick={() => void save({ clear: true })}>
                Снять закрытие
              </button>
            </div>
            {status?.closedFrom ? (
              <p className="page-subtitle" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
                С: {formatDateTime(status.closedFrom)}
                {status.closedUntil ? ` · до: ${formatDateTime(status.closedUntil)}` : " · без даты окончания"}
              </p>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

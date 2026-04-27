"use client";

import { useEffect, useMemo, useState } from "react";
import { TestResult, UserRecord } from "@/lib/types";

type Filter = "all" | "passed" | "failed" | "not_started";

export default function AdminResultsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/admin/results/bootstrap", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          users?: Array<Record<string, unknown>>;
          results?: Array<Record<string, unknown>>;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "admin_results_bootstrap_failed");
        }
        if (cancelled) return;
        const nextUsers = (payload.users || [])
          .map((u) => ({
            id: String(u.id),
            role: u.role === "admin" ? "admin" : "employee",
            name: String(u.name || ""),
            callsign: String(u.callsign || ""),
            login: "",
            password: "",
            position: "Специалист",
            canManageContent: false,
            permissions: {
              news: false,
              tests: false,
              results: false,
              uav: false,
              counteraction: false,
              users: false,
            },
            status: u.status === "inactive" ? "inactive" : "active",
          }))
          .filter((u) => u.role === "employee") as UserRecord[];
        const nextResults = (payload.results || []).map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          type: r.type === "final" ? "final" : "trial",
          status: r.status === "passed" ? "passed" : "failed",
          score: Number(r.score || 0),
          createdAt: String(r.created_at || ""),
        })) as TestResult[];
        setUsers(nextUsers);
        setResults(nextResults);
      } catch {
        if (cancelled) return;
        setLoadError("Не удалось получить данные результатов. Попробуйте обновить страницу.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<
    Array<{ id: string; name: string; callsign: string; status: Filter; score: number | null; date: string | null }>
  >(() => {
    const latestByUserId = new Map<string, TestResult>();
    for (const result of results) {
      if (!latestByUserId.has(result.userId)) {
        latestByUserId.set(result.userId, result);
      }
    }
    return users.map((user) => {
      const latest = latestByUserId.get(user.id);
      if (!latest) {
        return { id: user.id, name: user.name, callsign: user.callsign, status: "not_started" as const, score: null, date: null };
      }
      return {
        id: user.id,
        name: user.name,
        callsign: user.callsign,
        status: latest.status === "passed" ? ("passed" as const) : ("failed" as const),
        score: latest.score,
        date: latest.createdAt,
      };
    });
  }, [results, users]);

  const visible = rows.filter((row) => (filter === "all" ? true : row.status === filter));

  return (
    <section>
      <h1 className="page-title">Админ / Результаты тестов</h1>
      <p className="page-subtitle">Быстрые фильтры по статусам прохождения итогового теста.</p>
      {isLoading && <p className="page-subtitle">Загружаем результаты…</p>}
      {loadError && <p className="page-subtitle">{loadError}</p>}

      <div className="chips">
        <button className={`chip ${filter === "all" ? "active" : ""}`} type="button" onClick={() => setFilter("all")}>
          Все
        </button>
        <button className={`chip ${filter === "passed" ? "active" : ""}`} type="button" onClick={() => setFilter("passed")}>
          Сдал
        </button>
        <button className={`chip ${filter === "failed" ? "active" : ""}`} type="button" onClick={() => setFilter("failed")}>
          Не сдал
        </button>
        <button
          className={`chip ${filter === "not_started" ? "active" : ""}`}
          type="button"
          onClick={() => setFilter("not_started")}
        >
          Не проходил
        </button>
      </div>

      <div className="list" style={{ marginTop: 12 }}>
        {visible.map((row) => (
          <article className="card" key={row.id}>
            <div className="card-body">
              <h3>{row.name}</h3>
              <div className="meta" style={{ marginTop: 8 }}>
                <span>{row.callsign}</span>
                {row.status === "passed" && <span className="pill pill-green">Сдал</span>}
                {row.status === "failed" && <span className="pill pill-red">Не сдал</span>}
                {row.status === "not_started" && <span className="pill pill-yellow">Не проходил</span>}
                {row.score !== null && <span>{row.score}%</span>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

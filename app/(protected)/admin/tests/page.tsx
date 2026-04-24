"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAllResults } from "@/lib/tests-repository";
import { TestResult } from "@/lib/types";

export default function AdminTestsPage() {
  const [results, setResults] = useState<TestResult[]>([]);

  useEffect(() => {
    fetchAllResults().then(setResults);
  }, []);

  const { trial, final, failedFinal } = useMemo(() => {
    return {
      trial: results.filter((item) => item.type === "trial").length,
      final: results.filter((item) => item.type === "final").length,
      failedFinal: results.filter((item) => item.type === "final" && item.status === "failed").length,
    };
  }, [results]);

  return (
    <section>
      <h1 className="page-title">Админ / Тесты</h1>
      <p className="page-subtitle">Мониторинг тестовой активности и строгих итоговых попыток.</p>
      <div className="grid grid-two">
        <div className="card">
          <div className="card-body">
            <p className="label">Пробные попытки</p>
            <p className="stat-value">{trial}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Итоговые попытки</p>
            <p className="stat-value">{final}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Не сдали итоговый</p>
            <p className="stat-value">{failedFinal}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

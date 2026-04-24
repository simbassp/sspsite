"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchNews } from "@/lib/news-repository";
import { fetchAllResults } from "@/lib/tests-repository";
import { fetchUsers } from "@/lib/users-repository";
import { NewsItem, TestResult, UserRecord } from "@/lib/types";

export default function DashboardPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);

  useEffect(() => {
    Promise.all([fetchUsers(), fetchNews(), fetchAllResults()]).then(([nextUsers, nextNews, nextResults]) => {
      setUsers(nextUsers);
      setNews(nextNews);
      setResults(nextResults);
    });
  }, []);

  const stats = useMemo(() => {
    const activeUsers = users.filter((u) => u.status === "active");
    const finalResults = results.filter((r) => r.type === "final");
    const passed = finalResults.filter((r) => r.status === "passed").length;

    return {
      users: activeUsers.length,
      news: news.length,
      totalResults: finalResults.length,
      passedFinalPercent: finalResults.length ? Math.round((passed / finalResults.length) * 100) : 0,
    };
  }, [news.length, results, users]);

  return (
    <section>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Короткая сводка и быстрый вход в разделы без длинного скролла.</p>

      <div className="grid grid-two">
        <div className="card">
          <div className="card-body">
            <p className="label">Активных сотрудников</p>
            <p className="stat-value">{stats.users}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Новостей в базе</p>
            <p className="stat-value">{stats.news}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Итоговый тест</p>
            <p className="stat-value">{stats.passedFinalPercent}%</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Попыток итогового</p>
            <p className="stat-value">{stats.totalResults}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-two" style={{ marginTop: 12 }}>
        <Link href="/news" className="card">
          <div className="card-body">
            <h3>Новости</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Важные сообщения и уведомления.
            </p>
          </div>
        </Link>
        <Link href="/counteraction" className="card">
          <div className="card-body">
            <h3>Противодействие</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Каталог карточек со структурированными ТТХ.
            </p>
          </div>
        </Link>
        <Link href="/uav" className="card">
          <div className="card-body">
            <h3>ТТХ БПЛА</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Отдельные карточки и детальные страницы.
            </p>
          </div>
        </Link>
        <Link href="/tests" className="card">
          <div className="card-body">
            <h3>Тесты</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Пробный мягкий режим и строгий итоговый.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}

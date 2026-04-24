"use client";

import { useMemo, useState } from "react";
import { getPositions } from "@/lib/storage";
import { fetchUsers, patchUser, removeUser } from "@/lib/users-repository";
import { UserRecord } from "@/lib/types";

export default function AdminUsersPage() {
  const positions = useMemo(() => getPositions(), []);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [info, setInfo] = useState("");
  useState(() => {
    fetchUsers().then((next) => setUsers(next));
    return true;
  });

  const refresh = async () => {
    const next = await fetchUsers();
    setUsers(next);
  };

  const patchLocal = (
    userId: string,
    patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent">>,
  ) => {
    setUsers((prev) => prev.map((item) => (item.id === userId ? { ...item, ...patch } : item)));
    patchUser(userId, patch).catch(() => setInfo("Не удалось синхронизировать изменения."));
  };

  const visible = users.filter((item) => {
    const matchesText =
      `${item.name} ${item.callsign} ${item.login}`.toLowerCase().includes(query.toLowerCase().trim());
    const matchesStatus = status === "all" ? true : item.status === status;
    return matchesText && matchesStatus;
  });

  return (
    <section>
      <h1 className="page-title">Админ / Пользователи</h1>
      <p className="page-subtitle">Поиск и фильтрация сотрудников для работы с количеством 100+ пользователей.</p>

      <div className="grid grid-two">
        <input
          className="input"
          placeholder="Поиск по имени, позывному, логину"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="inactive">Деактивированные</option>
        </select>
      </div>
      {info && <p className="page-subtitle">{info}</p>}

      <div className="list" style={{ marginTop: 12 }}>
        {visible.map((user) => (
          <article className="card" key={user.id}>
            <div className="card-body">
              <div className="meta">
                <span className={`pill ${user.status === "active" ? "pill-green" : "pill-yellow"}`}>
                  {user.status === "active" ? "Активен" : "Деактивирован"}
                </span>
                <span>{user.role}</span>
                {user.canManageContent && <span className="pill pill-green">Редактор контента</span>}
                <span>@{user.login}</span>
              </div>

              <div className="grid grid-two" style={{ marginTop: 10 }}>
                <input className="input" value={user.name} onChange={(e) => patchLocal(user.id, { name: e.target.value })} />
                <input
                  className="input"
                  value={user.callsign}
                  onChange={(e) => patchLocal(user.id, { callsign: e.target.value })}
                />
                <select
                  className="select"
                  value={user.position}
                  onChange={(e) => patchLocal(user.id, { position: e.target.value as UserRecord["position"] })}
                >
                  {positions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    patchLocal(user.id, { canManageContent: !user.canManageContent });
                  }}
                >
                  {user.canManageContent ? "Снять права редактора" : "Выдать права редактора"}
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      patchLocal(user.id, { status: user.status === "active" ? "inactive" : "active" });
                    }}
                  >
                    {user.status === "active" ? "Деактивировать" : "Активировать"}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={async () => {
                      await removeUser(user.id);
                      await refresh();
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

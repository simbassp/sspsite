"use client";

import { useMemo, useState } from "react";
import { getPositions } from "@/lib/storage";
import { fetchUsers, patchUser, removeUser } from "@/lib/users-repository";
import { UserRecord } from "@/lib/types";

const permissionOptions = [
  { key: "news", label: "Новости" },
  { key: "tests", label: "Тесты" },
  { key: "uav", label: "БПЛА" },
  { key: "counteraction", label: "Противодействие" },
  { key: "users", label: "Редактирование и удаление пользователей" },
] as const;

export default function AdminUsersPage() {
  const positions = useMemo(() => getPositions(), []);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [info, setInfo] = useState("");
  const [permissionsTargetId, setPermissionsTargetId] = useState<string | null>(null);
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
    patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions">>,
  ) => {
    setUsers((prev) =>
      prev.map((item) => {
        if (item.id !== userId) return item;
        const nextPermissions = patch.permissions ? { ...item.permissions, ...patch.permissions } : item.permissions;
        return {
          ...item,
          ...patch,
          permissions: nextPermissions,
          canManageContent:
            patch.canManageContent ??
            nextPermissions.news ||
              nextPermissions.tests ||
              nextPermissions.uav ||
              nextPermissions.counteraction,
        };
      }),
    );
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
                    setPermissionsTargetId((prev) => (prev === user.id ? null : user.id));
                  }}
                >
                  {permissionsTargetId === user.id ? "Закрыть права" : "Выдать права"}
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
              {permissionsTargetId === user.id && (
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="card-body">
                    <h3 style={{ marginBottom: 8 }}>Права доступа</h3>
                    <div className="form">
                      {permissionOptions.map((item) => (
                        <label key={`${user.id}-${item.key}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={user.permissions[item.key]}
                            onChange={(event) => {
                              if (user.role === "admin") return;
                              const nextPermissions = {
                                ...user.permissions,
                                [item.key]: event.target.checked,
                              };
                              patchLocal(user.id, {
                                permissions: nextPermissions,
                                canManageContent:
                                  nextPermissions.news ||
                                  nextPermissions.tests ||
                                  nextPermissions.uav ||
                                  nextPermissions.counteraction,
                              });
                            }}
                            disabled={user.role === "admin"}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                      {user.role === "admin" && (
                        <p className="page-subtitle" style={{ marginBottom: 0 }}>
                          У администратора полный доступ по всем разделам.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

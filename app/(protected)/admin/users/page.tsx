"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { getPositions } from "@/lib/storage";
import { fetchUsers, patchUser, removeUser } from "@/lib/users-repository";
import { Role, UserRecord } from "@/lib/types";

const permissionOptions = [
  { key: "news", label: "Новости" },
  { key: "tests", label: "Тесты" },
  { key: "results", label: "Проверка результатов" },
  { key: "uav", label: "БПЛА" },
  { key: "counteraction", label: "Противодействие" },
  { key: "users", label: "Редактирование и удаление пользователей" },
  { key: "online", label: "Показывать кто онлайн" },
] as const;

const fullAdminPermissions = {
  news: true,
  tests: true,
  results: true,
  uav: true,
  counteraction: true,
  users: true,
  online: true,
} as const satisfies UserRecord["permissions"];

export default function AdminUsersPage() {
  const session = useMemo(() => readClientSession(), []);
  const canGrantAdminRole = session?.role === "admin";
  const positions = useMemo(() => getPositions(), []);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [info, setInfo] = useState("");
  const [permissionsTargetId, setPermissionsTargetId] = useState<string | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, UserRecord["permissions"]>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const patchTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    void fetchUsers().then((next) => setUsers(next));
  }, []);

  const refresh = async () => {
    const next = await fetchUsers();
    setUsers(next);
  };

  const getDraftPermissions = (user: UserRecord) => permissionDrafts[user.id] ?? user.permissions;

  const patchLocal = (
    userId: string,
    patch: Partial<
      Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions">
    >,
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
            (nextPermissions.news ||
              nextPermissions.tests ||
              nextPermissions.uav ||
              nextPermissions.counteraction),
        };
      }),
    );
    if (patchTimersRef.current[userId]) {
      clearTimeout(patchTimersRef.current[userId]);
    }
    patchTimersRef.current[userId] = setTimeout(() => {
      patchUser(userId, patch).catch(() => setInfo("Не удалось синхронизировать изменения."));
      delete patchTimersRef.current[userId];
    }, 350);
  };

  const applyRoleChange = async (user: UserRecord, nextRole: Role) => {
    if (!canGrantAdminRole || user.role === nextRole) return;
    if (user.role === "admin" && nextRole === "employee") {
      const ok = window.confirm(
        `Снять роль администратора с ${user.name} (@${user.login})? Сохранятся отдельные права в базе, если они были.`,
      );
      if (!ok) return;
    } else if (nextRole === "admin") {
      const ok = window.confirm(
        `Назначить пользователя ${user.name} администратором? У него будет полный доступ ко всем разделам после следующего входа.`,
      );
      if (!ok) return;
    }

    setUsers((prev) =>
      prev.map((item) => {
        if (item.id !== user.id) return item;
        if (nextRole === "admin") {
          return {
            ...item,
            role: "admin",
            permissions: { ...fullAdminPermissions },
            canManageContent: true,
          };
        }
        return { ...item, role: "employee" };
      }),
    );

    try {
      if (nextRole === "admin") {
        await patchUser(user.id, {
          role: "admin",
          permissions: { ...fullAdminPermissions },
          canManageContent: true,
        });
      } else {
        await patchUser(user.id, { role: "employee" });
      }
      setInfo(
        nextRole === "admin"
          ? "Назначен администратор. Чтобы интерфейс обновился, пользователю нужно выйти и войти снова."
          : "Роль изменена на «Сотрудник».",
      );
      await refresh();
    } catch {
      setInfo("Не удалось изменить роль. Обновите страницу.");
      await refresh();
    }
  };

  useEffect(() => {
    return () => {
      Object.values(patchTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    };
  }, []);

  const visible = users.filter((item) => {
    const matchesText =
      `${item.name} ${item.callsign} ${item.login}`.toLowerCase().includes(query.toLowerCase().trim());
    const matchesStatus = status === "all" ? true : item.status === status;
    return matchesText && matchesStatus;
  });

  return (
    <section className="admin-users-page">
      <h1 className="page-title">Админ / Пользователи</h1>
      <p className="page-subtitle admin-users-page__lead">
        Поиск и фильтрация. Роль «Администратор» может назначить только действующий администратор.
      </p>

      <div className="grid grid-two admin-users-page__filters">
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
      {info && <p className="page-subtitle admin-users-page__info">{info}</p>}

      <div className="list admin-users-page__list">
        {visible.map((user) => (
          <article className="card admin-users-page__card" key={user.id}>
            <div className="card-body">
              <div className="meta admin-users-page__meta">
                <span className={`pill ${user.status === "active" ? "pill-green" : "pill-yellow"}`}>
                  {user.status === "active" ? "Активен" : "Деактивирован"}
                </span>
                <span className="admin-users-page__login">@{user.login}</span>
                {canGrantAdminRole ? (
                  <select
                    className="select admin-users-page__role"
                    value={user.role}
                    onChange={(e) => void applyRoleChange(user, e.target.value as Role)}
                    aria-label="Роль пользователя"
                  >
                    <option value="employee">Сотрудник</option>
                    <option value="admin">Администратор</option>
                  </select>
                ) : (
                  <span className={`pill ${user.role === "admin" ? "pill-green" : ""}`}>
                    {user.role === "admin" ? "Админ" : "Сотрудник"}
                  </span>
                )}
              </div>

              <div className="admin-users-page__fields">
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
                    setPermissionDrafts((prev) =>
                      prev[user.id] ? prev : { ...prev, [user.id]: { ...user.permissions } },
                    );
                    setPermissionsTargetId((prev) => (prev === user.id ? null : user.id));
                  }}
                >
                  {permissionsTargetId === user.id ? "Закрыть права" : "Права"}
                </button>
              </div>

              <div className="admin-users-page__actions">
                {user.role !== "admin" && (
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={deletingId === user.id}
                    onClick={async () => {
                      const confirmed = window.confirm(`Удалить пользователя ${user.name} (@${user.login})?`);
                      if (!confirmed) return;
                      const userId = user.id;
                      setDeletingId(userId);
                      setInfo("Удаляем…");
                      let hadError: Error | null = null;
                      let remoteWarning: string | undefined;
                      try {
                        const result = await removeUser(userId);
                        if (!result.ok) {
                          setInfo(result.error);
                          setDeletingId(null);
                          return;
                        }
                        if ("warning" in result && result.warning) {
                          remoteWarning = result.warning;
                        }
                      } catch (e) {
                        hadError = e instanceof Error ? e : new Error(String(e));
                      }
                      try {
                        const next = await fetchUsers();
                        setUsers(next);
                        if (hadError) {
                          setInfo(hadError.message);
                        } else if (next.some((u) => u.id === userId)) {
                          setInfo(
                            "В базе запись public.app_users не снялась. Откройте Supabase → SQL, выполните скрипт из файла supabase/migrations/20260426150000_admin_delete_user_app_first.sql, затем снова нажмите «Удалить».",
                          );
                        } else if (remoteWarning) {
                          setInfo(remoteWarning);
                        } else {
                          setInfo("Пользователь удалён.");
                        }
                      } catch {
                        setInfo("Сервер не ответил при обновлении списка — обновите страницу вручную.");
                      } finally {
                        setDeletingId(null);
                      }
                    }}
                  >
                    {deletingId === user.id ? "Удаляем…" : "Удалить"}
                  </button>
                )}
              </div>

              {permissionsTargetId === user.id && (
                <div className="card admin-users-page__permissions">
                  <div className="card-body">
                    <h3 className="admin-users-page__perm-title">Права доступа</h3>
                    <div className="form admin-users-page__perm-form">
                      {permissionOptions.map((item) => (
                        <label key={`${user.id}-${item.key}`} className="admin-users-page__perm-row">
                          <input
                            type="checkbox"
                            checked={getDraftPermissions(user)[item.key]}
                            onChange={(event) => {
                              if (user.role === "admin") return;
                              const nextPermissions = {
                                ...getDraftPermissions(user),
                                [item.key]: event.target.checked,
                              };
                              setPermissionDrafts((prev) => ({ ...prev, [user.id]: nextPermissions }));
                            }}
                            disabled={user.role === "admin"}
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                      {user.role !== "admin" && (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={async () => {
                            const nextPermissions = getDraftPermissions(user);
                            const nextCanManageContent =
                              nextPermissions.news ||
                              nextPermissions.tests ||
                              nextPermissions.uav ||
                              nextPermissions.counteraction;
                            setUsers((prev) =>
                              prev.map((item) =>
                                item.id === user.id
                                  ? {
                                      ...item,
                                      permissions: { ...nextPermissions },
                                      canManageContent: nextCanManageContent,
                                    }
                                  : item,
                              ),
                            );
                            if (patchTimersRef.current[user.id]) {
                              clearTimeout(patchTimersRef.current[user.id]);
                              delete patchTimersRef.current[user.id];
                            }
                            try {
                              await patchUser(user.id, {
                                permissions: nextPermissions,
                                canManageContent: nextCanManageContent,
                              });
                              setInfo(
                                "Права сохранены. Чтобы у пользователя появилась кнопка \"Управление\", ему нужно выйти и войти снова.",
                              );
                              window.alert("Права сохранены.");
                            } catch {
                              setInfo("Не удалось сохранить права. Проверьте интернет и повторите.");
                            }
                          }}
                        >
                          Сохранить права
                        </button>
                      )}
                      {user.role === "admin" && (
                        <p className="page-subtitle admin-users-page__perm-hint">
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

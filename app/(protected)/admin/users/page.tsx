"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPermissionPicker } from "@/components/admin/AdminPermissionPicker";
import { ProfileNameColorPicker } from "@/components/admin/ProfileNameColorPicker";
import { UserIdentityDisplay } from "@/components/profile/UserIdentityDisplay";
import { UserAvatar } from "@/components/profile/UserAvatar";
import { UnitFieldLabel } from "@/components/profile/UnitFieldLabel";
import { readClientSession, writeClientSession } from "@/lib/client-auth";
import { ADMIN_PERMISSION_OPTIONS } from "@/lib/admin-permission-ui";
import { dutyLocationLabel } from "@/lib/duty-location";
import { POSITION_OPTIONS, getPositionBadgeClass, positionDisplayLabel } from "@/lib/position-ui";
import { canManageUsers } from "@/lib/permissions";
import type { ProfileNameColorId } from "@/lib/profile-name-color";
import { dispatchIdentityCosmeticsUpdated } from "@/lib/user-identity-cosmetics";
import { clearPagePrefetchCache, readPagePrefetchCache, writePagePrefetchCache } from "@/lib/page-prefetch-cache";
import { fetchUsersPage, patchUser, removeUser } from "@/lib/users-repository";
import type { DutyLocation, Position, Role, UnitAssignment, UserRecord } from "@/lib/types";
import { UNIT_ASSIGNMENT_OPTIONS, unitAssignmentLabel, unitAssignmentLabelOrEmpty } from "@/lib/unit-assignment";

const permissionOptions = ADMIN_PERMISSION_OPTIONS;

const fullAdminPermissions = {
  news: true,
  tests: true,
  results: true,
  resetResults: true,
  uav: true,
  counteraction: true,
  userList: true,
  users: true,
  online: false,
  personnelModeration: true,
} as const satisfies UserRecord["permissions"];

export default function AdminUsersPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  const session = useMemo(() => (isHydrated ? readClientSession() : null), [isHydrated]);
  const canEditUsers = session ? canManageUsers(session) : false;
  /** Только полные админы по пользователям видят сводку прав; режим «только список» — без этой колонки. */
  const showPermissionsColumn = canEditUsers;
  const canGrantAdminRole = session?.role === "admin";
  const canPickNameColor = session?.role === "admin";
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState<"all" | Position>("all");
  const [dutyFilter, setDutyFilter] = useState<"all" | DutyLocation>("all");
  const [unitFilter, setUnitFilter] = useState<"all" | "unset" | UnitAssignment>("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const usersFilterKey = useMemo(
    () => `${pageSize}|${query}|${positionFilter}|${dutyFilter}|${unitFilter}`,
    [pageSize, query, positionFilter, dutyFilter, unitFilter],
  );
  const usersCacheKey = useCallback((targetPage: number) => `admin-users:${usersFilterKey}:p=${targetPage}`, [usersFilterKey]);
  const [info, setInfo] = useState("");
  const [permissionsTargetId, setPermissionsTargetId] = useState<string | null>(null);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, UserRecord["permissions"]>>({});
  const [savingPermissionsId, setSavingPermissionsId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [positionEditUser, setPositionEditUser] = useState<UserRecord | null>(null);
  const [positionDraft, setPositionDraft] = useState<Position | "">("");
  const [positionSaving, setPositionSaving] = useState(false);
  const [savingNameColorId, setSavingNameColorId] = useState<string | null>(null);
  const permissionEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  type UsersPagePayload = { rows: UserRecord[]; total: number; page: number; pageSize: number };

  const fetchUsersPagePayload = useCallback(
    async (targetPage: number): Promise<UsersPagePayload | null> => {
      try {
        return await fetchUsersPage({
          page: targetPage,
          pageSize,
          search: query,
          position: positionFilter,
          duty: dutyFilter,
          unit: unitFilter,
        });
      } catch {
        return null;
      }
    },
    [pageSize, query, positionFilter, dutyFilter, unitFilter],
  );

  const prefetchUsersPage = useCallback(
    async (targetPage: number) => {
      const key = usersCacheKey(targetPage);
      if (readPagePrefetchCache(key)) return;
      const data = await fetchUsersPagePayload(targetPage);
      if (data) writePagePrefetchCache(key, data);
    },
    [fetchUsersPagePayload, usersCacheKey],
  );

  const loadUsers = useCallback(async (targetPage = page) => {
    const cacheKey = usersCacheKey(targetPage);
    const cached = readPagePrefetchCache<UsersPagePayload>(cacheKey);
    if (cached) {
      setUsers(cached.rows);
      setUsersTotal(cached.total);
      setPage(cached.page);
      setIsLoadingUsers(false);
      if (cached.page * cached.pageSize < cached.total) void prefetchUsersPage(cached.page + 1);
      return;
    }

    setIsLoadingUsers(true);
    try {
      const result = await fetchUsersPagePayload(targetPage);
      if (!result) return;
      setUsers(result.rows);
      setUsersTotal(result.total);
      setPage(result.page);
      writePagePrefetchCache(cacheKey, result);
      if (result.page * result.pageSize < result.total) void prefetchUsersPage(result.page + 1);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [fetchUsersPagePayload, page, prefetchUsersPage, usersCacheKey]);

  useEffect(() => {
    clearPagePrefetchCache("admin-users");
  }, [usersFilterKey]);

  useEffect(() => {
    if (!isHydrated) return;
    void loadUsers(page);
  }, [isHydrated, loadUsers]);

  const refresh = async (force = false) => {
    clearPagePrefetchCache("admin-users");
    await loadUsers(force ? 1 : page);
    if (force) setPage(1);
  };

  const savePositionChange = async () => {
    if (!positionEditUser || !positionDraft) return;
    if (positionDraft === positionEditUser.position) {
      setPositionEditUser(null);
      return;
    }
    setPositionSaving(true);
    setInfo("");
    try {
      await patchUser(positionEditUser.id, { position: positionDraft });
      if (session?.id === positionEditUser.id) {
        writeClientSession({ ...session, position: positionDraft });
      }
      setInfo("Должность обновлена. На главной появится запись о смене должности.");
      await refresh();
      setPositionEditUser(null);
    } catch {
      setInfo("Не удалось сохранить должность. Обновите страницу.");
      await refresh(true);
    } finally {
      setPositionSaving(false);
    }
  };

  const getDraftPermissions = (user: UserRecord) => permissionDrafts[user.id] ?? user.permissions;

  const openPermissionsEditor = (user: UserRecord) => {
    setPermissionDrafts((prev) => (prev[user.id] ? prev : { ...prev, [user.id]: { ...user.permissions } }));
    setPermissionsTargetId((prev) => (prev === user.id ? null : user.id));
  };

  const savePermissions = async (user: UserRecord) => {
    if (savingPermissionsId || user.role === "admin") return;
    const nextPermissions = getDraftPermissions(user);
    const nextCanManageContent =
      nextPermissions.news || nextPermissions.tests || nextPermissions.uav || nextPermissions.counteraction;
    setSavingPermissionsId(user.id);
    setInfo("");
    setUsers((prev) =>
      prev.map((item) =>
        item.id === user.id
          ? { ...item, permissions: { ...nextPermissions }, canManageContent: nextCanManageContent }
          : item,
      ),
    );
    try {
      await patchUser(user.id, {
        permissions: nextPermissions,
        canManageContent: nextCanManageContent,
      });
      setInfo("Права сохранены.");
      setPermissionsTargetId(null);
      await refresh();
    } catch {
      setInfo("Не удалось сохранить права. Проверьте интернет и повторите.");
      await refresh(true);
    } finally {
      setSavingPermissionsId(null);
    }
  };

  const deleteManagedUser = async (user: UserRecord) => {
    if (deletingId) return;
    const confirmed = window.confirm(`Удалить пользователя ${user.name} (@${user.login})?`);
    if (!confirmed) return;
    setDeletingId(user.id);
    setInfo("");
    try {
      const result = await removeUser(user.id);
      if (!result.ok) {
        setInfo(result.error);
        return;
      }
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      setInfo("warning" in result && result.warning ? result.warning : "Пользователь удалён.");
      await refresh(true);
    } finally {
      setDeletingId(null);
    }
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
      await refresh(true);
    } catch {
      setInfo("Не удалось изменить роль. Обновите страницу.");
      await refresh(true);
    }
  };

  const renderUserNameLine = (user: UserRecord) => (
    <UserIdentityDisplay
      name={user.name || "Без имени"}
      callsign={user.callsign}
      cosmetics={
        user.cosmetics ??
        (user.nameColor ? { adminNameColor: user.nameColor } : null)
      }
      emptyName="Без имени"
    />
  );

  const saveNameColor = async (user: UserRecord, next: ProfileNameColorId | null) => {
    if (savingNameColorId === user.id) return;
    setSavingNameColorId(user.id);
    setInfo("");
    try {
      await patchUser(user.id, { nameColor: next });
      if (session?.id === user.id) {
        writeClientSession({ ...session, nameColor: next });
        dispatchIdentityCosmeticsUpdated({ adminNameColor: next });
      }
      setInfo("Цвет имени обновлён.");
      await refresh(true);
    } catch {
      setInfo("Не удалось сохранить цвет имени.");
    } finally {
      setSavingNameColorId(null);
    }
  };

  const renderUserAvatar = (user: UserRecord) => (
    <UserAvatar
      name={user.name}
      callsign={user.callsign}
      avatarUrl={user.avatarUrl}
      size={38}
      className="admin-users-avatar"
      title={`${user.name || "Без имени"}${user.callsign ? ` ${user.callsign}` : ""}`}
      avatarFrame={user.cosmetics?.avatarFrame ?? null}
      bankOverlay={user.cosmetics?.bankOverlay ?? null}
      topRankBadge={user.cosmetics?.topRankBadge ?? null}
    />
  );

  const getPermissionsSummary = (user: UserRecord) => {
    const labels = permissionOptions
      .filter((opt) => user.permissions[opt.key])
      .map((opt) => {
        if (opt.key === "news") return "Новости";
        if (opt.key === "tests") return "Тесты";
        if (opt.key === "results") return "Рез.";
        if (opt.key === "uav") return "БПЛА";
        if (opt.key === "counteraction") return "Против.";
        if (opt.key === "userList") return "Список";
        if (opt.key === "users") return "Польз.";
        if (opt.key === "personnelModeration") return "Лич. дело";
        return "Сброс";
      });
    if (!labels.length) return "Нет прав";
    if (labels.length <= 2) return labels.join(", ");
    return `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;
  };

  const pages = Math.max(1, Math.ceil(usersTotal / pageSize));
  const currentPage = Math.min(page, pages);
  const permissionsTargetUser = permissionsTargetId ? users.find((item) => item.id === permissionsTargetId) ?? null : null;

  useEffect(() => {
    if (!permissionsTargetId) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth > 819) return;
    window.setTimeout(() => {
      const node = permissionEditorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const y = rect.top + window.scrollY - 12;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }, 80);
  }, [permissionsTargetId]);

  return (
    <section className="admin-users-page">
      <h1 className="page-title">Админ / Пользователи</h1>
      <p className="page-subtitle admin-users-page__lead">
        {canEditUsers
          ? "Управление пользователями и их правами доступа."
          : "Просмотр списка и профилей без изменения прав и данных."}
      </p>

      {!isHydrated ? (
        <p className="page-subtitle">Загрузка...</p>
      ) : (
      <>
      {isLoadingUsers && <p className="page-subtitle">Загрузка...</p>}
      <div className="grid grid-two admin-users-page__filters">
        <input
          className="input"
          placeholder="Поиск по имени, логину"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="select"
          value={positionFilter}
          onChange={(e) => {
            setPositionFilter(e.target.value as typeof positionFilter);
            setPage(1);
          }}
        >
          <option value="all">Все должности</option>
          {POSITION_OPTIONS.map((position) => (
            <option key={position} value={position}>
              {positionDisplayLabel(position)}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={dutyFilter}
          onChange={(e) => {
            setDutyFilter(e.target.value as typeof dutyFilter);
            setPage(1);
          }}
        >
          <option value="all">Все места</option>
          <option value="base">{dutyLocationLabel.base}</option>
          <option value="deployment">{dutyLocationLabel.deployment}</option>
        </select>
        <select
          className="select"
          value={unitFilter}
          onChange={(e) => {
            setUnitFilter(e.target.value as typeof unitFilter);
            setPage(1);
          }}
        >
          <option value="all">Все</option>
          <option value="unset">Не указано</option>
          {UNIT_ASSIGNMENT_OPTIONS.map((unit) => (
            <option key={unit} value={unit}>
              {unitAssignmentLabel[unit]}
            </option>
          ))}
        </select>
      </div>
      {isHydrated && (
        <p className="page-subtitle" style={{ marginBottom: 10 }}>
          Фильтрация по должности, месту положения и подразделению (взвод / рота).
        </p>
      )}
      {info && <p className="page-subtitle admin-users-page__info">{info}</p>}

      {isHydrated && canEditUsers && permissionsTargetUser && (
        <div className="card admin-users-page__permissions-editor" ref={permissionEditorRef}>
          <div className="card-body">
            <div className="admin-users-person">
              {renderUserAvatar(permissionsTargetUser)}
              <span>
                <strong>{renderUserNameLine(permissionsTargetUser)}</strong>
                <small>@{permissionsTargetUser.login}</small>
                <small>{positionDisplayLabel(permissionsTargetUser.position)}</small>
              </span>
            </div>
            {canPickNameColor ? (
              <ProfileNameColorPicker
                value={permissionsTargetUser.nameColor ?? null}
                disabled={savingNameColorId === permissionsTargetUser.id}
                onChange={(next) => void saveNameColor(permissionsTargetUser, next)}
              />
            ) : null}
            {canGrantAdminRole && (
              <label className="admin-users-role-switch">
                <span className="label">Роль администратора</span>
                <input
                  type="checkbox"
                  checked={permissionsTargetUser.role === "admin"}
                  onChange={(e) => void applyRoleChange(permissionsTargetUser, e.target.checked ? "admin" : "employee")}
                />
              </label>
            )}
            <h3 className="admin-users-page__perm-title">Права доступа</h3>
            <AdminPermissionPicker
              permissions={getDraftPermissions(permissionsTargetUser)}
              disabled={permissionsTargetUser.role === "admin"}
              onToggle={(key, checked) => {
                if (permissionsTargetUser.role === "admin") return;
                const nextPermissions = { ...getDraftPermissions(permissionsTargetUser), [key]: checked };
                setPermissionDrafts((prev) => ({ ...prev, [permissionsTargetUser.id]: nextPermissions }));
              }}
            />
            <div className="admin-users-page__perm-actions">
              {permissionsTargetUser.role !== "admin" ? (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={savingPermissionsId === permissionsTargetUser.id}
                  onClick={() => void savePermissions(permissionsTargetUser)}
                >
                  {savingPermissionsId === permissionsTargetUser.id ? "Сохраняем..." : "Сохранить"}
                </button>
              ) : (
                <p className="page-subtitle admin-users-page__perm-hint">У администратора полный доступ по всем разделам.</p>
              )}
              <button className="btn" type="button" onClick={() => setPermissionsTargetId(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-users-table-wrap card">
        <div className="card-body">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Должность</th>
                <th>Место</th>
                <th title="Подразделение">П</th>
                {showPermissionsColumn ? <th>Права</th> : null}
                {canEditUsers ? <th>Действия</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/profile/${user.id}`} prefetch={false} className="admin-users-profile-link">
                      <div className="admin-users-person">
                        {renderUserAvatar(user)}
                        <span>
                          <strong>{renderUserNameLine(user)}</strong>
                          <small>@{user.login}</small>
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <div className="admin-users-role-position">
                      <span className={`admin-users-role-text ${user.role === "admin" ? "is-admin" : "is-employee"}`}>
                        {user.role === "admin" ? "Администратор" : "Сотрудник"}
                      </span>
                      {canEditUsers ? (
                        <button
                          type="button"
                          className={`admin-users-position-badge ${getPositionBadgeClass(user.position)} admin-users-position-badge--editable`}
                          title="Изменить должность"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPositionEditUser(user);
                            setPositionDraft(
                              (POSITION_OPTIONS as readonly string[]).includes(user.position.trim())
                                ? (user.position as Position)
                                : "Специалист",
                            );
                          }}
                        >
                          {positionDisplayLabel(user.position)}
                        </button>
                      ) : (
                        <span className={`admin-users-position-badge ${getPositionBadgeClass(user.position)}`} title="Должность">
                          {positionDisplayLabel(user.position)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`duty-location-badge duty-location-badge--${user.dutyLocation}`}
                      title={dutyLocationLabel[user.dutyLocation]}
                    >
                      {dutyLocationLabel[user.dutyLocation]}
                    </span>
                  </td>
                  <td>
                    <span className="unit-assignment-badge" title="П">
                      {unitAssignmentLabelOrEmpty(user.unitAssignment)}
                    </span>
                  </td>
                  {showPermissionsColumn ? (
                    <td>
                      <span className="admin-users-perms-text" title={permissionOptions.filter((opt) => user.permissions[opt.key]).map((opt) => opt.label).join(", ") || "Нет прав"}>
                        {getPermissionsSummary(user)}
                      </span>
                    </td>
                  ) : null}
                  {canEditUsers ? (
                    <td>
                      <div className="admin-users-table__actions">
                        <button
                          className="btn"
                          style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                          type="button"
                          title="Редактировать"
                          aria-label={`Редактировать права ${user.name}`}
                          onClick={() => openPermissionsEditor(user)}
                        >
                          ✏
                        </button>
                        {user.role !== "admin" && (
                          <button
                            className="btn btn-danger"
                            style={{ width: 38, height: 34, padding: 0, fontSize: 16, lineHeight: 1 }}
                            type="button"
                            disabled={deletingId === user.id}
                            title="Удалить"
                            aria-label={`Удалить ${user.name}`}
                            onClick={() => void deleteManagedUser(user)}
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="admin-users-mobile-list">
            {users.map((user) => (
              <article className="card admin-users-mobile-card" key={`mobile-${user.id}`}>
                <div className="card-body">
                  <Link href={`/profile/${user.id}`} prefetch={false} className="admin-users-profile-link">
                    <div className="admin-users-person">
                      {renderUserAvatar(user)}
                      <span>
                        <strong>{renderUserNameLine(user)}</strong>
                        <small>@{user.login}</small>
                      </span>
                    </div>
                  </Link>
                  <div className="admin-users-role-position">
                    <span className={`admin-users-role-text ${user.role === "admin" ? "is-admin" : "is-employee"}`}>
                      {user.role === "admin" ? "Администратор" : "Сотрудник"}
                    </span>
                    {canEditUsers ? (
                      <button
                        type="button"
                        className={`admin-users-position-badge ${getPositionBadgeClass(user.position)} admin-users-position-badge--editable`}
                        title="Изменить должность"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPositionEditUser(user);
                          setPositionDraft(
                            (POSITION_OPTIONS as readonly string[]).includes(user.position.trim())
                              ? (user.position as Position)
                              : "Специалист",
                          );
                        }}
                      >
                        {positionDisplayLabel(user.position)}
                      </button>
                    ) : (
                      <span className={`admin-users-position-badge ${getPositionBadgeClass(user.position)}`} title="Должность">
                        {positionDisplayLabel(user.position)}
                      </span>
                    )}
                  </div>
                  <p style={{ marginTop: 8, marginBottom: 0 }}>
                    <span className={`duty-location-badge duty-location-badge--${user.dutyLocation}`}>
                      {dutyLocationLabel[user.dutyLocation]}
                    </span>
                    {" · "}
                    <span className="unit-assignment-badge">{unitAssignmentLabelOrEmpty(user.unitAssignment)}</span>
                  </p>
                  {showPermissionsColumn ? <p className="admin-users-perms-text">{getPermissionsSummary(user)}</p> : null}
                  {canEditUsers ? (
                    <div className="admin-users-table__actions admin-users-mobile-actions">
                      <button
                        className="btn"
                        style={{ width: 42, height: 38, padding: 0, fontSize: 16, lineHeight: 1 }}
                        type="button"
                        title="Редактировать"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openPermissionsEditor(user);
                        }}
                      >
                        ✏
                      </button>
                      {user.role !== "admin" && (
                        <button
                          className="btn btn-danger"
                          style={{ width: 42, height: 38, padding: 0, fontSize: 16, lineHeight: 1 }}
                          type="button"
                          disabled={deletingId === user.id}
                          title="Удалить"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void deleteManagedUser(user);
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="admin-users-footer">
            <span>Всего: {usersTotal}</span>
            <div className="admin-users-pagination">
              <button className="btn" type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                ‹
              </button>
              <span className="admin-users-page-indicator">{currentPage}</span>
              <button className="btn" type="button" disabled={currentPage >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
                ›
              </button>
            </div>
            <select className="select admin-users-page-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10 на странице</option>
              <option value={20}>20 на странице</option>
              <option value={30}>30 на странице</option>
            </select>
          </div>
        </div>
      </div>
      </>
      )}

      {isHydrated && positionEditUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="position-edit-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <article className="card" style={{ width: "min(420px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-body">
              <h3 id="position-edit-title">Смена должности</h3>
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                {positionEditUser.name} (@{positionEditUser.login})
              </p>
              <label className="label">Должность</label>
              <select
                className="select"
                value={positionDraft}
                onChange={(e) => setPositionDraft(e.target.value as Position)}
              >
                {POSITION_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={positionSaving || !positionDraft}
                  onClick={() => void savePositionChange()}
                >
                  {positionSaving ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={positionSaving}
                  onClick={() => setPositionEditUser(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

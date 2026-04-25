"use client";

import { clearSessionCookie, serializeSessionCookie } from "@/lib/auth";
import { readClientSession } from "@/lib/client-auth";
import { SESSION_COOKIE } from "@/lib/seed";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  authenticate,
  deleteUser,
  listUsers,
  registerEmployee,
  updateUser,
} from "@/lib/storage";
import { Position, SessionUser, UserPermissions, UserRecord } from "@/lib/types";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  login: string;
  name: string;
  callsign: string;
  position: string;
  can_manage_content?: boolean;
  can_manage_news?: boolean;
  can_manage_tests?: boolean;
  can_manage_uav?: boolean;
  can_manage_counteraction?: boolean;
  can_manage_users?: boolean;
  role: "employee" | "admin";
  status: "active" | "inactive";
};

type InviteCodeRow = {
  code: string;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
  created_at: string;
};

type ServerLoginSuccess = {
  ok: true;
  session: SessionUser;
  auth: {
    accessToken: string;
    refreshToken: string;
  };
};

type ServerLoginError = {
  ok: false;
  error: string;
};

export type InviteCodeRecord = {
  code: string;
  isActive: boolean;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
};

const LOCAL_INVITES_KEY = "ssp_local_invites_v1";
const LOGIN_EMAIL_CACHE_KEY = "ssp_login_email_cache_v1";
const LOGIN_SERVER_TIMEOUT_MS = 12000;
const LOGIN_RESOLVE_TIMEOUT_MS = 5000;
const LOGIN_AUTH_TIMEOUT_MS = 12000;
const LOGIN_PROFILE_TIMEOUT_MS = 8000;

function defaultPermissionsFromLegacy(row: {
  role: "employee" | "admin";
  can_manage_content?: boolean;
}): UserPermissions {
  const isAdmin = row.role === "admin";
  const legacyContent = row.can_manage_content === true;
  return {
    news: isAdmin || legacyContent,
    tests: isAdmin || legacyContent,
    uav: isAdmin || legacyContent,
    counteraction: isAdmin || legacyContent,
    users: isAdmin,
  };
}

function normalizePermissions(input: {
  role: "employee" | "admin";
  can_manage_content?: boolean;
  can_manage_news?: boolean;
  can_manage_tests?: boolean;
  can_manage_uav?: boolean;
  can_manage_counteraction?: boolean;
  can_manage_users?: boolean;
  permissions?: Partial<UserPermissions> | undefined;
}) {
  const fallback = defaultPermissionsFromLegacy(input);
  const merged = {
    ...fallback,
    ...(input.permissions ?? {}),
    ...(input.can_manage_news !== undefined ? { news: input.can_manage_news === true } : {}),
    ...(input.can_manage_tests !== undefined ? { tests: input.can_manage_tests === true } : {}),
    ...(input.can_manage_uav !== undefined ? { uav: input.can_manage_uav === true } : {}),
    ...(input.can_manage_counteraction !== undefined ? { counteraction: input.can_manage_counteraction === true } : {}),
    ...(input.can_manage_users !== undefined ? { users: input.can_manage_users === true } : {}),
  };
  if (input.role === "admin") {
    return {
      news: true,
      tests: true,
      uav: true,
      counteraction: true,
      users: true,
    } satisfies UserPermissions;
  }
  return merged satisfies UserPermissions;
}

function toSessionUser(row: UserRow): SessionUser {
  const permissions = normalizePermissions(row);
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    callsign: row.callsign,
    position: row.position as Position,
    canManageContent: permissions.news || permissions.tests || permissions.uav || permissions.counteraction,
    permissions,
  };
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    ...toSessionUser(row),
    login: row.login,
    status: row.status,
    password: "",
  };
}

function mapInvite(row: InviteCodeRow): InviteCodeRecord {
  return {
    code: row.code,
    isActive: row.is_active,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    createdAt: row.created_at,
  };
}

async function loginViaServer(login: string, password: string): Promise<ServerLoginSuccess | ServerLoginError | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = (await Promise.race([
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ login, password }),
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("request_timeout")), LOGIN_SERVER_TIMEOUT_MS);
      }),
    ])) as Response;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    let payload: ServerLoginSuccess | ServerLoginError | null = null;
    try {
      payload = (await response.json()) as ServerLoginSuccess | ServerLoginError;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      // Infrastructure/proxy response: let direct Supabase fallback handle auth.
      if ([404, 405, 500, 502, 503, 504].includes(response.status)) {
        return null;
      }
      return {
        ok: false,
        error:
          payload && "error" in payload && payload.error
            ? payload.error
            : `Сервер авторизации вернул ошибку (${response.status}).`,
      };
    }
    if (!payload || !("ok" in payload) || payload.ok !== true) {
      return {
        ok: false,
        error: "Некорректный ответ сервера авторизации. Повторите попытку.",
      };
    }
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "request_timeout") {
      return {
        ok: false,
        error: "Сервер авторизации отвечает слишком долго. Попробуйте снова.",
      };
    }
    return null;
  }
}

function readLocalInvites(): InviteCodeRecord[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LOCAL_INVITES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as InviteCodeRecord[];
  } catch {
    return [];
  }
}

function writeLocalInvites(rows: InviteCodeRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_INVITES_KEY, JSON.stringify(rows));
}

type LoginEmailCache = Record<string, string>;

function readLoginEmailCache(): LoginEmailCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOGIN_EMAIL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LoginEmailCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getCachedEmailForLogin(login: string) {
  const key = login.trim().toLowerCase();
  if (!key) return "";
  return readLoginEmailCache()[key] ?? "";
}

function cacheEmailForLogin(login: string, email: string) {
  if (typeof window === "undefined") return;
  const key = login.trim().toLowerCase();
  const value = email.trim().toLowerCase();
  if (!key || !value) return;
  const next = { ...readLoginEmailCache(), [key]: value };
  window.localStorage.setItem(LOGIN_EMAIL_CACHE_KEY, JSON.stringify(next));
}

async function resolveEmailByLogin(login: string) {
  if (!isSupabaseConfigured) return null;
  const supabase = getSupabaseBrowserClient();
  try {
    const result = (await Promise.race([
      supabase.rpc("resolve_login_email", {
        p_login: login,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("resolve_login_timeout")), LOGIN_RESOLVE_TIMEOUT_MS);
      }),
    ])) as Awaited<ReturnType<typeof supabase.rpc>>;
    const { data, error } = result;
    if (error || !data || typeof data !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

async function validateInviteCode(code: string) {
  if (!isSupabaseConfigured) return true;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("validate_invite_code", {
    p_code: code,
  });
  if (error) return false;
  return data === true;
}

function canUseLocalFallback() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function mapAuthErrorMessage(raw: string) {
  const msg = raw.toLowerCase();
  if (msg.includes("rate limit")) {
    return "Слишком много запросов на сброс. Подождите 60 секунд и попробуйте снова.";
  }
  if (msg.includes("invite") || msg.includes("приглаш")) {
    return "У вас нет приглашения. Проверьте персональный код регистрации.";
  }
  if (msg.includes("database error saving new user")) {
    return "Регистрация отклонена. Проверьте персональный код приглашения.";
  }
  return raw;
}

function normalizeSessionUser(session: SessionUser): SessionUser {
  const permissions = normalizePermissions({
    role: session.role,
    can_manage_content: session.canManageContent,
    permissions: session.permissions,
  });
  return {
    ...session,
    permissions,
    canManageContent: permissions.news || permissions.tests || permissions.uav || permissions.counteraction,
  };
}

export async function loginUser(login: string, password: string) {
  if (!isSupabaseConfigured) {
    if (!canUseLocalFallback()) {
      return {
        ok: false as const,
        error:
          "Supabase не подключен в прод-среде. Проверьте NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY и пересоберите приложение.",
      };
    }
    const local = authenticate(login, password);
    return local
      ? { ok: true as const, session: local }
      : { ok: false as const, error: "Неверный логин/пароль или пользователь деактивирован." };
  }

  const loginTrim = login.trim();
  const serverResult = await loginViaServer(loginTrim, password);
  if (serverResult?.ok) {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth
      .setSession({
        access_token: serverResult.auth.accessToken,
        refresh_token: serverResult.auth.refreshToken,
      })
      .catch(() => undefined);
    return { ok: true as const, session: normalizeSessionUser(serverResult.session) };
  }

  let serverError = "";
  if (serverResult && !serverResult.ok) {
    serverError = serverResult.error;
  }
  if (!canUseLocalFallback()) {
    return {
      ok: false as const,
      error: serverError || "Сервис авторизации временно недоступен. Попробуйте снова через несколько секунд.",
    };
  }

  const supabase = getSupabaseBrowserClient();

  let authUserId: string | null = null;
  let lastError = "";
  let successfulEmail = "";
  const emailsToTry: string[] = [];
  if (loginTrim.includes("@")) {
    emailsToTry.push(loginTrim);
  } else {
    const localStyleEmail = `${loginTrim}@ssp.local`;
    const cachedEmail = getCachedEmailForLogin(loginTrim);
    if (cachedEmail) {
      emailsToTry.push(cachedEmail);
    } else {
      const resolved = await resolveEmailByLogin(loginTrim);
      if (resolved) {
        emailsToTry.push(resolved);
      }
    }
    if (!emailsToTry.includes(localStyleEmail)) {
      emailsToTry.push(localStyleEmail);
    }
  }

  // Keep fallback bounded: max two auth attempts to avoid long mobile hangs.
  for (const email of emailsToTry.slice(0, 2)) {
    const authResult = (await Promise.race([
      supabase.auth.signInWithPassword({ email, password }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("auth_timeout")), LOGIN_AUTH_TIMEOUT_MS);
      }),
    ]).catch(() => null)) as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null;
    if (!authResult) {
      lastError = "Сервер авторизации отвечает слишком долго. Попробуйте снова.";
      continue;
    }
    const { data, error } = authResult;
    if (!error && data.user) {
      authUserId = data.user.id;
      successfulEmail = email;
      break;
    }
    lastError = error?.message ?? lastError;
  }

  if (!authUserId) {
    return { ok: false as const, error: lastError || serverError || "Неверный логин/пароль." };
  }

  const profileResult = (await Promise.race([
    supabase.from("app_users").select("*").eq("auth_user_id", authUserId).maybeSingle(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("profile_timeout")), LOGIN_PROFILE_TIMEOUT_MS);
    }),
  ]).catch(() => null)) as { data: UserRow | null; error: { message?: string } | null } | null;

  if (!profileResult) {
    await supabase.auth.signOut();
    return { ok: false as const, error: "Профиль app_users отвечает слишком долго. Попробуйте снова." };
  }

  const { data: profile, error: profileError } = profileResult;

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false as const, error: "Профиль пользователя не найден в app_users." };
  }

  const row = profile as UserRow;
  if (row.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false as const, error: "Пользователь деактивирован администратором." };
  }

  if (!loginTrim.includes("@") && successfulEmail) {
    cacheEmailForLogin(loginTrim, successfulEmail);
  }

  return { ok: true as const, session: toSessionUser(row) };
}

export async function requestPasswordReset(loginOrEmail: string) {
  if (!isSupabaseConfigured) {
    if (!canUseLocalFallback()) {
      return {
        ok: false as const,
        error:
          "Supabase не подключен в прод-среде. Проверьте NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY и пересоберите приложение.",
      };
    }
    return { ok: false as const, error: "Сброс доступен только в режиме Supabase." };
  }

  const supabase = getSupabaseBrowserClient();
  let lastError = "";
  const redirectTo = `${window.location.origin}/reset-password`;
  const loginTrim = loginOrEmail.trim();
  const emailsToTry = new Set<string>();
  if (loginTrim.includes("@")) {
    emailsToTry.add(loginTrim);
  } else {
    const resolved = await resolveEmailByLogin(loginTrim);
    if (!resolved) {
      return {
        ok: false as const,
        error:
          "Логин не найден в базе профилей. Проверьте логин или войдите по email.",
      };
    }
    emailsToTry.add(resolved);
  }

  for (const email of emailsToTry) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (!error) {
      return { ok: true as const };
    }
    lastError = mapAuthErrorMessage(error.message);
  }

  return { ok: false as const, error: lastError || "Не удалось отправить ссылку для сброса." };
}

export async function fetchCurrentAuthEmail() {
  if (!isSupabaseConfigured) {
    return { ok: false as const, error: "Смена email доступна только в режиме Supabase." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false as const, error: "Не удалось получить email текущего пользователя." };
  }
  return { ok: true as const, email: data.user.email ?? "" };
}

export async function updateCurrentUserEmail(nextEmail: string) {
  if (!isSupabaseConfigured) {
    return { ok: false as const, error: "Смена email доступна только в режиме Supabase." };
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({ email: nextEmail.trim() });
  if (error) {
    return { ok: false as const, error: mapAuthErrorMessage(error.message) };
  }
  return {
    ok: true as const,
    message: "Запрос отправлен. Подтвердите новый email по письму и затем войдите снова.",
  };
}

export async function updateCurrentUserPassword(nextPassword: string) {
  if (!isSupabaseConfigured) {
    return { ok: false as const, error: "Смена пароля доступна только в режиме Supabase." };
  }
  if (nextPassword.length < 6) {
    return { ok: false as const, error: "Пароль должен быть не короче 6 символов." };
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({ password: nextPassword });
  if (error) {
    return { ok: false as const, error: mapAuthErrorMessage(error.message) };
  }
  return { ok: true as const, message: "Пароль успешно обновлен." };
}

export async function updateCurrentUserPasswordWithOldPassword(input: {
  oldPassword: string;
  nextPassword: string;
}) {
  const oldPassword = input.oldPassword.trim();
  const nextPassword = input.nextPassword;
  if (!oldPassword) {
    return { ok: false as const, error: "Введите текущий пароль." };
  }
  if (nextPassword.length < 6) {
    return { ok: false as const, error: "Пароль должен быть не короче 6 символов." };
  }
  if (!isSupabaseConfigured) {
    return { ok: false as const, error: "Смена пароля доступна только в режиме Supabase." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const currentEmail = userData.user?.email?.trim() ?? "";
  if (userError || !currentEmail) {
    return { ok: false as const, error: "Не удалось получить текущий email пользователя." };
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: currentEmail,
    password: oldPassword,
  });
  if (authError) {
    return { ok: false as const, error: "Текущий пароль введен неверно." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword });
  if (updateError) {
    return { ok: false as const, error: mapAuthErrorMessage(updateError.message) };
  }
  return { ok: true as const, message: "Пароль успешно изменен." };
}

export async function updateCurrentUserProfile(payload: { name: string; callsign: string }) {
  const name = payload.name.trim();
  const callsign = payload.callsign.trim();
  if (!name) {
    return { ok: false as const, error: "Имя не может быть пустым." };
  }
  if (!callsign) {
    return { ok: false as const, error: "Позывной не может быть пустым." };
  }

  if (!isSupabaseConfigured) {
    const current = readClientSession();
    if (!current) {
      return { ok: false as const, error: "Сессия не найдена." };
    }
    updateUser(current.id, { name, callsign });
    return { ok: true as const, name, callsign };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("update_my_profile", {
    p_name: name,
    p_callsign: callsign,
  });
  if (error || data !== true) {
    return { ok: false as const, error: "Не удалось обновить профиль. Попробуйте позже." };
  }
  return { ok: true as const, name, callsign };
}

export async function registerUser(payload: {
  email: string;
  login: string;
  name: string;
  callsign: string;
  password: string;
  position: Position;
  inviteCode: string;
}) {
  if (!isSupabaseConfigured) {
    if (!canUseLocalFallback()) {
      return {
        ok: false as const,
        error:
          "Supabase не подключен в прод-среде. Регистрация отключена до настройки NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      };
    }
    return registerEmployee({
      login: payload.login,
      name: payload.name,
      callsign: payload.callsign,
      password: payload.password,
      position: payload.position,
    });
  }

  const supabase = getSupabaseBrowserClient();
  const inviteCode = payload.inviteCode.trim();
  if (!inviteCode) {
    return { ok: false as const, error: "Введите персональный код приглашения." };
  }

  const inviteValid = await validateInviteCode(inviteCode);
  if (!inviteValid) {
    return { ok: false as const, error: "У вас нет приглашения. Неверный персональный код." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: {
      data: {
        login: payload.login,
        name: payload.name,
        callsign: payload.callsign,
        position: payload.position,
        invite_code: inviteCode,
      },
    },
  });

  if (error) {
    return { ok: false as const, error: mapAuthErrorMessage(error.message) };
  }

  if (!data.user) {
    return { ok: false as const, error: "Не удалось создать пользователя auth." };
  }

  await supabase.auth.signOut();
  return { ok: true as const };
}

export async function fetchInviteCodes() {
  if (!isSupabaseConfigured) {
    return readLocalInvites();
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("registration_invites")
    .select("code,is_active,max_uses,used_count,created_at")
    .order("created_at", { ascending: false });
  if (error || !data) {
    return readLocalInvites();
  }
  return (data as InviteCodeRow[]).map(mapInvite);
}

export async function createInviteCode(input: { code: string; maxUses: number | null }) {
  const normalizedCode = input.code.trim();
  const maxUses = input.maxUses && input.maxUses > 0 ? Math.floor(input.maxUses) : null;
  if (!normalizedCode) {
    return { ok: false as const, error: "Введите код приглашения." };
  }

  if (!isSupabaseConfigured) {
    const current = readLocalInvites();
    const exists = current.some((row) => row.code.toLowerCase() === normalizedCode.toLowerCase());
    const nextRow: InviteCodeRecord = {
      code: normalizedCode,
      isActive: true,
      maxUses,
      usedCount: 0,
      createdAt: new Date().toISOString(),
    };
    const next = exists
      ? current.map((row) => (row.code.toLowerCase() === normalizedCode.toLowerCase() ? nextRow : row))
      : [nextRow, ...current];
    writeLocalInvites(next);
    return { ok: true as const };
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("registration_invites").upsert(
    {
      code: normalizedCode,
      is_active: true,
      max_uses: maxUses,
      used_count: 0,
    },
    { onConflict: "code" },
  );
  if (error) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

export async function disableInviteCode(code: string) {
  if (!isSupabaseConfigured) {
    const next = readLocalInvites().map((row) => (row.code === code ? { ...row, isActive: false } : row));
    writeLocalInvites(next);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  await supabase.from("registration_invites").update({ is_active: false }).eq("code", code);
}

export async function removeInviteCode(code: string) {
  if (!isSupabaseConfigured) {
    const next = readLocalInvites().filter((row) => row.code !== code);
    writeLocalInvites(next);
    return;
  }
  const supabase = getSupabaseBrowserClient();
  await supabase.from("registration_invites").delete().eq("code", code);
}

export async function fetchUsers() {
  if (!isSupabaseConfigured) {
    return listUsers();
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listUsers();
  }

  return (data as UserRow[]).map(toUserRecord);
}

export async function patchUser(
  userId: string,
  patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions">>,
) {
  if (!isSupabaseConfigured) {
    updateUser(userId, patch);
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const nextPermissions = patch.permissions;
  const nextCanManageContent =
    nextPermissions !== undefined
      ? nextPermissions.news || nextPermissions.tests || nextPermissions.uav || nextPermissions.counteraction
      : patch.canManageContent;

  const payload = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.callsign !== undefined ? { callsign: patch.callsign } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(nextCanManageContent !== undefined ? { can_manage_content: nextCanManageContent } : {}),
    ...(nextPermissions !== undefined ? { can_manage_news: nextPermissions.news } : {}),
    ...(nextPermissions !== undefined ? { can_manage_tests: nextPermissions.tests } : {}),
    ...(nextPermissions !== undefined ? { can_manage_uav: nextPermissions.uav } : {}),
    ...(nextPermissions !== undefined ? { can_manage_counteraction: nextPermissions.counteraction } : {}),
    ...(nextPermissions !== undefined ? { can_manage_users: nextPermissions.users } : {}),
  };
  const { error } = await supabase.from("app_users").update(payload).eq("id", userId);
  if (error) {
    // Backward-compatible fallback for older schemas without granular permission columns.
    const legacyPayload = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.callsign !== undefined ? { callsign: patch.callsign } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(nextCanManageContent !== undefined ? { can_manage_content: nextCanManageContent } : {}),
    };
    const fallback = await supabase.from("app_users").update(legacyPayload).eq("id", userId);
    if (fallback.error) {
      updateUser(userId, patch);
    }
  } else {
    updateUser(userId, patch);
  }
}

export async function removeUser(userId: string) {
  if (!isSupabaseConfigured) {
    deleteUser(userId);
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
  if (error) {
    const { error: fallbackError } = await supabase.from("app_users").delete().eq("id", userId);
    if (fallbackError) {
      deleteUser(userId);
    }
  }
}

export async function logoutUser() {
  document.cookie = clearSessionCookie();
  document.cookie = `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  if (typeof window !== "undefined") {
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.includes("sb-") || key.includes("supabase") || key.includes("auth-token")) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => window.localStorage.removeItem(key));
  }
  if (!isSupabaseConfigured) return;
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
}

export function persistSession(session: SessionUser) {
  document.cookie = serializeSessionCookie(session);
}

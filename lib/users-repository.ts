"use client";

import { clearSessionCookie, serializeSessionCookie } from "@/lib/auth";
import { readClientSession } from "@/lib/client-auth";
import { SESSION_COOKIE } from "@/lib/seed";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { withTimeout, withTimeoutAndRetry } from "@/lib/async-utils";
import {
  authenticate,
  deleteUser,
  listUsers,
  registerEmployee,
  replaceAllUsersInLocalCache,
  updateUser,
} from "@/lib/storage";
import { normalizeDutyLocation } from "@/lib/duty-location";
import { DutyLocation, Position, SessionUser, UserPermissions, UserRecord } from "@/lib/types";

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
  can_manage_results?: boolean;
  can_manage_uav?: boolean;
  can_manage_counteraction?: boolean;
  can_manage_users?: boolean;
  can_view_user_list?: boolean;
  can_reset_test_results?: boolean;
  can_view_online?: boolean;
  is_online?: boolean;
  duty_location?: string | null;
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

/** Точное сопоставление через ilike (без %/_), с экранированием спецсимволов ILIKE. */
function inviteCodeIlikeExact(value: string) {
  return value
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}
/** Одна попытка /api/auth/login: RPC + token + профиль; не обрывать раньше типичного ответа Supabase на LTE. */
const LOGIN_SERVER_TIMEOUT_MS = 55000;
const LOGIN_RESOLVE_TIMEOUT_MS = 5000;
const LOGIN_AUTH_TIMEOUT_MS = 12000;
const LOGIN_PROFILE_TIMEOUT_MS = 8000;
/** Медленный LTE/мобильный слабее десктопа — короткие лимиты давали ложные «код неверный» / «сервер не отвечает». */
const REGISTER_VALIDATE_TIMEOUT_MS = 12000;
const REGISTER_AUTH_TIMEOUT_MS = 32000;
/** Перепроверка после таймаута signUp: короче, чтобы не ждать минуту при дубликатах email/логина. */
const REGISTER_RECHECK_SIGNIN_MS = 7000;
const REGISTER_RECHECK_SIGNUP_MS = 7000;

/** Сообщение PostgREST/Postgres о несуществующей колонке в PATCH. */
function restErrorMissingColumn(message: string | undefined, column: string) {
  const m = (message ?? "").toLowerCase();
  const col = column.toLowerCase();
  if (!col || !m.includes(col)) return false;
  return (
    m.includes("does not exist") ||
    m.includes("undefined column") ||
    m.includes("could not find") ||
    (m.includes("column") && m.includes("unknown"))
  );
}

function defaultPermissionsFromLegacy(row: {
  role: "employee" | "admin";
  can_manage_content?: boolean;
}): UserPermissions {
  const isAdmin = row.role === "admin";
  const legacyContent = row.can_manage_content === true;
  return {
    news: isAdmin || legacyContent,
    tests: isAdmin || legacyContent,
    results: isAdmin || legacyContent,
    resetResults: isAdmin,
    uav: isAdmin || legacyContent,
    counteraction: isAdmin || legacyContent,
    userList: false,
    users: isAdmin,
    online: isAdmin,
  };
}

function normalizePermissions(input: {
  role: "employee" | "admin";
  can_manage_content?: boolean;
  can_manage_news?: boolean;
  can_manage_tests?: boolean;
  can_manage_results?: boolean;
  can_manage_uav?: boolean;
  can_manage_counteraction?: boolean;
  can_manage_users?: boolean;
  can_view_user_list?: boolean;
  can_reset_test_results?: boolean;
  can_view_online?: boolean;
  permissions?: Partial<UserPermissions> | undefined;
}) {
  const fallback = defaultPermissionsFromLegacy(input);
  const merged = {
    ...fallback,
    ...(input.permissions ?? {}),
    ...(input.can_manage_news !== undefined ? { news: input.can_manage_news === true } : {}),
    ...(input.can_manage_tests !== undefined ? { tests: input.can_manage_tests === true } : {}),
    ...(input.can_manage_results !== undefined ? { results: input.can_manage_results === true } : {}),
    ...(input.can_reset_test_results !== undefined ? { resetResults: input.can_reset_test_results === true } : {}),
    ...(input.can_manage_uav !== undefined ? { uav: input.can_manage_uav === true } : {}),
    ...(input.can_manage_counteraction !== undefined ? { counteraction: input.can_manage_counteraction === true } : {}),
    ...(input.can_manage_users !== undefined ? { users: input.can_manage_users === true } : {}),
    ...(input.can_view_user_list !== undefined ? { userList: input.can_view_user_list === true } : {}),
    ...(input.can_view_online !== undefined ? { online: input.can_view_online === true } : {}),
  };
  if (input.role === "admin") {
    return {
      news: true,
      tests: true,
      results: true,
      resetResults: true,
      uav: true,
      counteraction: true,
      userList: true,
      users: true,
      online: true,
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
    isOnline: row.is_online === true,
    dutyLocation: normalizeDutyLocation(row.duty_location),
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
        cache: "no-store",
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
        error: "request_timeout",
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
  try {
    const result = (await Promise.race([
      supabase.rpc("validate_invite_code", {
        p_code: code,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("validate_invite_timeout")), REGISTER_VALIDATE_TIMEOUT_MS);
      }),
    ])) as Awaited<ReturnType<typeof supabase.rpc>>;
    const { data, error } = result;
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

async function resolveInviteCodeForRegistration(inputCode: string) {
  const trimmed = inputCode.trim();
  if (!trimmed) return "";

  if (typeof window !== "undefined") {
    const tryServerValidate = async () => {
      const res = await fetch("/api/register/validate-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
        cache: "no-store",
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        valid?: boolean;
        canonicalCode?: string;
        serverCheckSkipped?: boolean;
      };
      if (res.ok && payload.ok && payload.valid && typeof payload.canonicalCode === "string" && payload.canonicalCode) {
        return payload.canonicalCode.trim();
      }
      return null;
    };
    try {
      const first = await tryServerValidate();
      if (first) return first;
    } catch {
      /* пробуем повтор / RPC */
    }
    try {
      await new Promise((r) => setTimeout(r, 450));
      const second = await tryServerValidate();
      if (second) return second;
    } catch {
      /* пробуем RPC ниже */
    }
  }

  const variants = Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()]));
  for (const variant of variants) {
    const valid = await validateInviteCode(variant);
    if (valid) return variant;
  }
  return "";
}

function canUseLocalFallback() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/** Ошибка дубликата email/логина — не гоняем «перепроверку» как при обрыве сети. */
function isDuplicateRegistrationError(raw: string) {
  const msg = raw.toLowerCase();
  return (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("email already") ||
    msg.includes("user already registered") ||
    msg.includes("app_users_login_key") ||
    msg.includes("unique constraint") ||
    msg.includes("unique violation") ||
    (msg.includes("duplicate key") && (msg.includes("login") || msg.includes("email")))
  );
}

async function checkRegistrationAvailability(
  email: string,
  login: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") return { ok: true };
  try {
    const res = (await Promise.race([
      fetch("/api/register/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), login: login.trim() }),
        cache: "no-store",
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("availability_timeout")), 5000);
      }),
    ])) as Response;
    const payload = (await res.json()) as { ok?: boolean; emailTaken?: boolean; loginTaken?: boolean };
    if (!res.ok || !payload.ok) return { ok: true };
    if (payload.loginTaken) {
      return { ok: false, error: "Логин уже занят. Укажите другой логин." };
    }
    if (payload.emailTaken) {
      return { ok: false, error: "Пользователь с таким email уже зарегистрирован." };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

function mapAuthErrorMessage(raw: string) {
  const msg = raw.toLowerCase();
  if (
    msg.includes("app_users_login_key") ||
    (msg.includes("duplicate key value") && msg.includes("login")) ||
    msg.includes("duplicate login")
  ) {
    return "Логин уже занят. Укажите другой логин.";
  }
  if (
    msg.includes("app_users_email_key") ||
    (msg.includes("duplicate key value") && msg.includes("email")) ||
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("email already in use")
  ) {
    return "Пользователь с таким email уже зарегистрирован.";
  }
  if (msg.includes("rate limit")) {
    return "Слишком много запросов на сброс. Подождите 60 секунд и попробуйте снова.";
  }
  if (msg.includes("invite") || msg.includes("приглаш")) {
    return "Код приглашения недействителен или лимит использований исчерпан. Запросите у администратора новый код.";
  }
  if (msg.includes("database error saving new user")) {
    return "Регистрация отклонена из-за конфликта данных. Проверьте логин и email, затем повторите попытку.";
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
    void getSupabaseBrowserClient()
      .auth.setSession({
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

  if (error) {
    const raw = error.message || "";
    const low = raw.toLowerCase();
    if (low.includes("duplicate") || low.includes("unique constraint")) {
      return { ok: false as const, error: "Такой позывной уже занят. Укажите другой." };
    }
    return {
      ok: false as const,
      error: raw ? `Не удалось обновить профиль: ${raw}` : "Не удалось обновить профиль. Попробуйте позже.",
    };
  }

  if (data !== true) {
    return {
      ok: false as const,
      error:
        "Профиль не сохранён: запись пользователя не найдена в базе. Выйдите из аккаунта и войдите снова; если не поможет — напишите администратору.",
    };
  }
  return { ok: true as const, name, callsign };
}

export async function updateCurrentUserDutyLocation(location: DutyLocation) {
  if (location !== "base" && location !== "deployment") {
    return { ok: false as const, error: "Некорректное значение места положения." };
  }

  if (!isSupabaseConfigured) {
    const current = readClientSession();
    if (!current) {
      return { ok: false as const, error: "Сессия не найдена." };
    }
    updateUser(current.id, { dutyLocation: location });
    return { ok: true as const, dutyLocation: location };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("update_my_duty_location", {
    p_location: location,
  });

  if (error) {
    const raw = error.message || "";
    return {
      ok: false as const,
      error: raw ? `Не удалось сохранить: ${raw}` : "Не удалось сохранить место положения.",
    };
  }

  if (data !== true) {
    return {
      ok: false as const,
      error: "Запись пользователя не найдена. Выйдите и войдите снова.",
    };
  }

  return { ok: true as const, dutyLocation: location };
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
  const inviteCodeRaw = payload.inviteCode.trim();
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
  if (!inviteCodeRaw) {
    return { ok: false as const, error: "Введите персональный код приглашения." };
  }

  // Параллельно: занятость email/логина + валидация кода — быстрее, чем строго по очереди.
  const [availability, inviteCode] = await Promise.all([
    checkRegistrationAvailability(payload.email, payload.login),
    resolveInviteCodeForRegistration(inviteCodeRaw),
  ]);
  if (!availability.ok) {
    return { ok: false as const, error: availability.error };
  }
  if (!inviteCode) {
    return {
      ok: false as const,
      error: "Персональный код недействителен или лимит использований исчерпан. Запросите у администратора новый код.",
    };
  }

  const confirmRegistrationCreated = async () => {
    // Ответ signUp мог потеряться по сети, хотя пользователь уже в auth/app_users.
    // Сначала вход — быстрее и надёжнее, чем повторный signUp (лимиты / дубликаты).
    try {
      const authTry = await Promise.race([
        supabase.auth.signInWithPassword({
          email: payload.email,
          password: payload.password,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("register_signin_recheck_timeout")), REGISTER_RECHECK_SIGNIN_MS);
        }),
      ]);
      if (authTry.data?.user) {
        await supabase.auth.signOut().catch(() => undefined);
        return true;
      }
    } catch {}

    try {
      const retry = await Promise.race([
        supabase.auth.signUp({
          email: payload.email,
          password: payload.password,
          options: { data: { login: payload.login } },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("register_recheck_timeout")), REGISTER_RECHECK_SIGNUP_MS);
        }),
      ]);
      const retryErr = retry.error?.message?.toLowerCase() ?? "";
      if (retryErr.includes("already registered") || retryErr.includes("already been registered")) {
        return true;
      }
    } catch {}

    return false;
  };

  let data: { user?: unknown } | null = null;
  let error: { message: string } | null = null;
  try {
    const result = (await Promise.race([
      supabase.auth.signUp({
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
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("register_auth_timeout")), REGISTER_AUTH_TIMEOUT_MS);
      }),
    ])) as Awaited<ReturnType<typeof supabase.auth.signUp>>;
    data = result.data as { user?: unknown };
    error = result.error as { message: string } | null;
  } catch {
    const createdAnyway = await confirmRegistrationCreated();
    if (createdAnyway) {
      await supabase.auth.signOut().catch(() => undefined);
      return { ok: true as const };
    }
    return { ok: false as const, error: "Сервер регистрации не отвечает. Повторите попытку через 10-20 секунд." };
  }

  if (error) {
    if (isDuplicateRegistrationError(error.message)) {
      return { ok: false as const, error: mapAuthErrorMessage(error.message) };
    }
    const low = error.message.toLowerCase();
    const looksLikeTransportOrUnknownFailure =
      low.includes("network") ||
      low.includes("timeout") ||
      low.includes("fetch") ||
      low.includes("failed to fetch") ||
      low.includes("temporarily unavailable") ||
      low.includes("503") ||
      low.includes("502") ||
      low.includes("504") ||
      low.includes("request failed") ||
      low.includes("edge") ||
      low.trim().length === 0;
    if (looksLikeTransportOrUnknownFailure) {
      const createdAnyway = await confirmRegistrationCreated();
      if (createdAnyway) {
        await supabase.auth.signOut().catch(() => undefined);
        return { ok: true as const };
      }
    }
    return { ok: false as const, error: mapAuthErrorMessage(error.message) };
  }

  if (!data.user) {
    const createdAnyway = await confirmRegistrationCreated();
    if (createdAnyway) {
      await supabase.auth.signOut().catch(() => undefined);
      return { ok: true as const };
    }
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
  const normalizedCode = input.code.trim().toUpperCase();
  const maxUses = input.maxUses && input.maxUses > 0 ? Math.floor(input.maxUses) : null;
  if (!normalizedCode) {
    return { ok: false as const, error: "Введите код приглашения." };
  }
  if (normalizedCode.length < 3 || normalizedCode.length > 40) {
    return { ok: false as const, error: "Длина кода должна быть от 3 до 40 символов." };
  }
  if (!/^[A-Z0-9-]+$/.test(normalizedCode)) {
    return { ok: false as const, error: "Используйте только латинские буквы, цифры и дефисы." };
  }

  if (!isSupabaseConfigured) {
    const current = readLocalInvites();
    const exists = current.some((row) => row.code.toLowerCase() === normalizedCode.toLowerCase());
    if (exists) {
      return { ok: false as const, error: "Такой код уже существует." };
    }
    const nextRow: InviteCodeRecord = {
      code: normalizedCode,
      isActive: true,
      maxUses,
      usedCount: 0,
      createdAt: new Date().toISOString(),
    };
    const next = [nextRow, ...current];
    writeLocalInvites(next);
    return { ok: true as const };
  }

  const supabase = getSupabaseBrowserClient();
  const pattern = inviteCodeIlikeExact(normalizedCode);
  const { data: existingRows, error: existingError } = await supabase
    .from("registration_invites")
    .select("code")
    .ilike("code", pattern)
    .limit(1);
  if (!existingError && existingRows && existingRows.length > 0) {
    return { ok: false as const, error: "Такой код уже существует." };
  }
  const { error } = await supabase.from("registration_invites").insert(
    {
      code: normalizedCode,
      is_active: true,
      max_uses: maxUses,
    },
  );
  if (error) {
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}

export async function disableInviteCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) {
    const needle = code.trim().toLowerCase();
    const next = readLocalInvites().map((row) =>
      row.code.toLowerCase() === needle ? { ...row, isActive: false } : row,
    );
    writeLocalInvites(next);
    return { ok: true as const };
  }
  const supabase = getSupabaseBrowserClient();
  const pattern = inviteCodeIlikeExact(code);
  const { data: found, error: findErr } = await supabase.from("registration_invites").select("code").ilike("code", pattern).limit(1);
  if (findErr) return { ok: false as const, error: findErr.message || "Не удалось отключить код." };
  if (!found?.length) return { ok: false as const, error: "Код не найден." };
  const { error } = await supabase.from("registration_invites").update({ is_active: false }).ilike("code", pattern);
  if (error) return { ok: false as const, error: error.message || "Не удалось отключить код." };
  return { ok: true as const };
}

export async function enableInviteCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) {
    const needle = code.trim().toLowerCase();
    const next = readLocalInvites().map((row) =>
      row.code.toLowerCase() === needle ? { ...row, isActive: true } : row,
    );
    writeLocalInvites(next);
    return { ok: true as const };
  }
  const supabase = getSupabaseBrowserClient();
  const pattern = inviteCodeIlikeExact(code);
  const { data: found, error: findErr } = await supabase.from("registration_invites").select("code").ilike("code", pattern).limit(1);
  if (findErr) return { ok: false as const, error: findErr.message || "Не удалось включить код." };
  if (!found?.length) return { ok: false as const, error: "Код не найден." };
  const { error } = await supabase.from("registration_invites").update({ is_active: true }).ilike("code", pattern);
  if (error) return { ok: false as const, error: error.message || "Не удалось включить код." };
  return { ok: true as const };
}

export async function removeInviteCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) {
    const needle = code.trim().toLowerCase();
    const next = readLocalInvites().filter((row) => row.code.toLowerCase() !== needle);
    writeLocalInvites(next);
    return { ok: true as const };
  }
  const supabase = getSupabaseBrowserClient();
  const raw = code.trim();
  const candidates = Array.from(new Set([raw, raw.toUpperCase(), raw.toLowerCase()])).filter(Boolean);
  let deleted = false;
  let lastError = "";

  for (const candidate of candidates) {
    const exactDelete = await supabase.from("registration_invites").delete().eq("code", candidate);
    if (!exactDelete.error) {
      deleted = true;
      break;
    }
    lastError = exactDelete.error.message || lastError;
  }

  if (!deleted) {
    const pattern = inviteCodeIlikeExact(raw);
    const ilikeDelete = await supabase.from("registration_invites").delete().ilike("code", pattern);
    if (ilikeDelete.error) {
      const probe = await supabase.from("registration_invites").select("code").ilike("code", pattern).limit(1);
      if (probe.error) return { ok: false as const, error: probe.error.message || ilikeDelete.error.message || "Не удалось удалить код." };
      if (!probe.data?.length) return { ok: false as const, error: "Код не найден." };
      return { ok: false as const, error: ilikeDelete.error.message || "Не удалось удалить код." };
    }
    deleted = true;
  }

  if (!deleted) return { ok: false as const, error: lastError || "Не удалось удалить код." };
  return { ok: true as const };
}

export async function fetchUsers() {
  if (!isSupabaseConfigured) {
    return listUsers();
  }

  try {
    const api = await withTimeoutAndRetry(
      () =>
        fetch("/api/admin/users/list", {
          method: "GET",
          cache: "no-store",
          headers: { "cache-control": "no-store" },
        }),
      7000,
      1,
      "fetch_users_timeout",
    );
    if (!api.ok) {
      return listUsers();
    }
    const payload = (await api.json()) as { ok?: boolean; rows?: UserRow[] };
    if (!payload.ok || !Array.isArray(payload.rows)) {
      return listUsers();
    }
    const list = payload.rows.map(toUserRecord);
    replaceAllUsersInLocalCache(list);
    return list;
  } catch {
    return listUsers();
  }
}

export async function patchUser(
  userId: string,
  patch: Partial<
    Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions" | "role">
  >,
) {
  const patchForLocalCache: Partial<
    Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions" | "role">
  > =
    patch.role === "admin"
      ? {
          ...patch,
          permissions: {
    news: true,
    tests: true,
    results: true,
    resetResults: true,
    uav: true,
    counteraction: true,
    userList: true,
    users: true,
    online: true,
          },
          canManageContent: true,
        }
      : patch;

  if (!isSupabaseConfigured) {
    updateUser(userId, patchForLocalCache);
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (response.ok && payload.ok) {
      updateUser(userId, patchForLocalCache);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const nextPermissions = patch.permissions;
    const nextCanManageContent =
      nextPermissions !== undefined
        ? nextPermissions.news || nextPermissions.tests || nextPermissions.uav || nextPermissions.counteraction
        : patch.canManageContent;
    const fallbackPayload = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.callsign !== undefined ? { callsign: patch.callsign } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(nextCanManageContent !== undefined ? { can_manage_content: nextCanManageContent } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    };
    const fallback = await supabase.from("app_users").update(fallbackPayload).eq("id", userId);
    if (!fallback.error) {
      updateUser(userId, patchForLocalCache);
    }
  } catch {
    // keep UI stable on transient failures
  }
}

const REMOVE_USER_TIMEOUT_MS = 15000;

export async function removeUser(userId: string): Promise<
  { ok: true } | { ok: true; warning: string } | { ok: false; error: string }
> {
  const targetPrecheck = listUsers().find((u) => u.id === userId) || null;
  if (targetPrecheck?.role === "admin") {
    return { ok: false, error: "Удаление учётной записи администратора запрещено." };
  }

  if (!isSupabaseConfigured) {
    deleteUser(userId);
    return { ok: true as const };
  }

  try {
    const api = await withTimeout(
      fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
      REMOVE_USER_TIMEOUT_MS,
      "remove_user_timeout",
    );
    const payload = (await api.json()) as { ok?: boolean; error?: string; warning?: string | null };
    if (!api.ok || !payload.ok) {
      return { ok: false as const, error: payload.error || "server_delete_failed" };
    }
    deleteUser(userId);
    if (payload.warning) {
      return { ok: true as const, warning: `Список на устройстве обновлён. Сервер: ${payload.warning}` };
    }
    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false as const, error: msg || "remove_user_failed" };
  } finally {
    // no-op
  }
}

export async function logoutUser() {
  // Отправить «офлайн» пока cookie сессии ещё есть; иначе POST уходит без auth → 401 в консоли.
  try {
    await Promise.race([
      fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ online: false }),
        keepalive: true,
      }).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 600)),
    ]);
  } catch {
    /* best-effort */
  }
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
  void supabase.auth.signOut().catch(() => undefined);
}

export function persistSession(session: SessionUser) {
  document.cookie = serializeSessionCookie(session);
}

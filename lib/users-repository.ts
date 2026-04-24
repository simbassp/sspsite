"use client";

import { clearSessionCookie, serializeSessionCookie } from "@/lib/auth";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  authenticate,
  deleteUser,
  listUsers,
  registerEmployee,
  updateUser,
} from "@/lib/storage";
import { Position, SessionUser, UserRecord } from "@/lib/types";

type UserRow = {
  id: string;
  auth_user_id: string | null;
  login: string;
  name: string;
  callsign: string;
  position: string;
  role: "employee" | "admin";
  status: "active" | "inactive";
};

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    callsign: row.callsign,
    position: row.position as Position,
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

function candidateEmails(login: string) {
  if (login.includes("@")) {
    return [login];
  }
  return [`${login}@ssp.local`, login];
}

async function resolveEmailByLogin(login: string) {
  if (!isSupabaseConfigured) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("resolve_login_email", {
    p_login: login,
  });
  if (error || !data || typeof data !== "string") return null;
  return data;
}

function canUseLocalFallback() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
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

  const supabase = getSupabaseBrowserClient();

  let authUserId: string | null = null;
  let lastError = "";
  const loginTrim = login.trim();
  const emailsToTry = new Set<string>(candidateEmails(loginTrim));
  if (!loginTrim.includes("@")) {
    const resolved = await resolveEmailByLogin(loginTrim);
    if (resolved) {
      emailsToTry.add(resolved);
    }
  }

  for (const email of emailsToTry) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      authUserId = data.user.id;
      break;
    }
    lastError = error?.message ?? lastError;
  }

  if (!authUserId) {
    return { ok: false as const, error: lastError || "Неверный логин/пароль." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("app_users")
    .select("id,auth_user_id,login,name,callsign,position,role,status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    return { ok: false as const, error: "Профиль пользователя не найден в app_users." };
  }

  const row = profile as UserRow;
  if (row.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false as const, error: "Пользователь деактивирован администратором." };
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
  const redirectTo = `${window.location.origin}/login`;
  const loginTrim = loginOrEmail.trim();
  const emailsToTry = new Set<string>(candidateEmails(loginTrim));
  if (!loginTrim.includes("@")) {
    const resolved = await resolveEmailByLogin(loginTrim);
    if (resolved) {
      emailsToTry.add(resolved);
    }
  }

  for (const email of emailsToTry) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (!error) {
      return { ok: true as const };
    }
    lastError = error.message;
  }

  return { ok: false as const, error: lastError || "Не удалось отправить ссылку для сброса." };
}

export async function registerUser(payload: {
  email: string;
  login: string;
  name: string;
  callsign: string;
  password: string;
  position: Position;
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

  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
  });

  if (error) {
    return { ok: false as const, error: error.message };
  }

  const authUserId = data.user?.id;
  if (!authUserId) {
    return { ok: false as const, error: "Не удалось создать пользователя auth." };
  }

  const { error: insertError } = await supabase.from("app_users").insert({
    auth_user_id: authUserId,
    login: payload.login,
    name: payload.name,
    callsign: payload.callsign,
    position: payload.position,
    role: "employee",
    status: "active",
  });

  if (insertError) {
    return { ok: false as const, error: insertError.message };
  }

  await supabase.auth.signOut();
  return { ok: true as const };
}

export async function fetchUsers() {
  if (!isSupabaseConfigured) {
    return listUsers();
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,auth_user_id,login,name,callsign,position,role,status")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return listUsers();
  }

  return (data as UserRow[]).map(toUserRecord);
}

export async function patchUser(
  userId: string,
  patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status">>,
) {
  if (!isSupabaseConfigured) {
    updateUser(userId, patch);
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("app_users").update(patch).eq("id", userId);
  if (error) {
    updateUser(userId, patch);
  }
}

export async function removeUser(userId: string) {
  if (!isSupabaseConfigured) {
    deleteUser(userId);
    return;
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("app_users").delete().eq("id", userId);
  if (error) {
    deleteUser(userId);
  }
}

export async function logoutUser() {
  document.cookie = clearSessionCookie();
  if (!isSupabaseConfigured) return;
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut();
}

export function persistSession(session: SessionUser) {
  document.cookie = serializeSessionCookie(session);
}

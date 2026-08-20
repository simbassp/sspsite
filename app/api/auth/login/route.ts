import { NextResponse } from "next/server";
import { resolveActiveUserAuthEmail } from "@/lib/auth-login-email-server";
import { serializeSessionCookie } from "@/lib/auth";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import type { SessionUser } from "@/lib/types";

export const runtime = "nodejs";

type SupabaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  user?: {
    id?: string;
  };
  error_description?: string;
  msg?: string;
};

type ProfileRow = {
  id: string;
  auth_user_id?: string | null;
  role: "employee" | "admin";
  name: string;
  callsign: string;
  position: string;
  can_manage_content?: boolean;
  can_manage_news?: boolean;
  can_manage_tests?: boolean;
  can_manage_results?: boolean;
  can_manage_uav?: boolean;
  can_manage_counteraction?: boolean;
  can_manage_tactical_medicine?: boolean;
  can_manage_users?: boolean;
  can_view_user_list?: boolean;
  can_reset_test_results?: boolean;
  can_view_online?: boolean;
  can_moderate_personnel?: boolean;
  unit_assignment?: string | null;
  avatar_url?: string | null;
  profile_name_color?: string | null;
  status: "active" | "inactive";
};

const SUPABASE_REQUEST_TIMEOUT_MS = 12_000;
const AUTH_SIGN_IN_RETRIES = 1;

function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const email = raw.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function normalizeSupabaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function authError(message: string) {
  const lowered = message.toLowerCase();
  if (lowered.includes("invalid login credentials")) return "Неверный логин/пароль.";
  if (lowered.includes("email not confirmed")) return "Email не подтвержден. Подтвердите почту по письму.";
  if (lowered.includes("too many requests")) return "Слишком много попыток входа. Подождите и попробуйте снова.";
  return "Не удалось выполнить вход. Попробуйте снова.";
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs = SUPABASE_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function signInWithEmail(baseUrl: string, anonKey: string, email: string, password: string) {
  let lastError = "Сервер авторизации временно недоступен. Повторите попытку.";
  for (let attempt = 0; attempt <= AUTH_SIGN_IN_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
      });
      const data = (await response.json()) as SupabaseTokenResponse;
      if (response.ok && data.access_token && data.refresh_token) {
        return { ok: true as const, data };
      }
      return {
        ok: false as const,
        error: authError(data.error_description ?? data.msg ?? "auth_failed"),
      };
    } catch {
      if (attempt < AUTH_SIGN_IN_RETRIES) continue;
      lastError = "Сервер авторизации временно недоступен. Повторите попытку.";
    }
  }
  return {
    ok: false as const,
    error: lastError,
  };
}

function canLinkProfileToAuthUser(profile: ProfileRow, authUserId: string) {
  if (profile.auth_user_id && profile.auth_user_id !== authUserId) return false;
  return profile.id === authUserId || !profile.auth_user_id;
}

async function signInWithLogin(baseUrl: string, anonKey: string, login: string, password: string) {
  const resolved = (
    await resolveActiveUserAuthEmail(login, {
      url: baseUrl,
      anonKey,
    })
  )?.trim();
  const emailsToTry = uniqueEmails([resolved ?? "", `${login.trim().toLowerCase()}@ssp.local`]);

  let lastError = "Неверный логин/пароль.";
  for (const email of emailsToTry) {
    const signIn = await signInWithEmail(baseUrl, anonKey, email, password);
    if (signIn.ok) return signIn;
    lastError = signIn.error;
  }

  return { ok: false as const, error: lastError };
}

async function fetchProfileViaServiceRole(authUserId: string, loginHint: string) {
  try {
    const supabase = getServerSupabaseServiceClient();
    const select = "*";

    const byAuth = await supabase.from("app_users").select(select).eq("auth_user_id", authUserId).maybeSingle();
    if (byAuth.error) return null;
    if (byAuth.data) return byAuth.data as ProfileRow;

    const byId = await supabase.from("app_users").select(select).eq("id", authUserId).maybeSingle();
    if (byId.error) return null;
    if (byId.data) {
      const profile = byId.data as ProfileRow;
      if (canLinkProfileToAuthUser(profile, authUserId) && profile.auth_user_id !== authUserId) {
        await supabase.from("app_users").update({ auth_user_id: authUserId }).eq("id", profile.id);
        profile.auth_user_id = authUserId;
      }
      return profile;
    }

    const login = loginHint.trim();
    if (login && !login.includes("@")) {
      const byLogin = await supabase.from("app_users").select(select).ilike("login", login).maybeSingle();
      if (byLogin.error) return null;
      if (byLogin.data) {
        const profile = byLogin.data as ProfileRow;
        if (profile.auth_user_id !== authUserId) {
          await supabase.from("app_users").update({ auth_user_id: authUserId }).eq("id", profile.id);
          profile.auth_user_id = authUserId;
        }
        return profile;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchProfileViaUserToken(
  baseUrl: string,
  anonKey: string,
  accessToken: string,
  authUserId: string,
) {
  async function query(filter: "auth_user_id" | "id") {
    const url = new URL(`${baseUrl}/rest/v1/app_users`);
    url.searchParams.set("select", "*");
    url.searchParams.set(filter, `eq.${authUserId}`);
    url.searchParams.set("limit", "1");
    const response = await fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as ProfileRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  try {
    return (await query("auth_user_id")) ?? (await query("id"));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: "Авторизация не настроена на сервере." }, { status: 500 });
  }

  let payload: { login?: string; password?: string } = {};
  try {
    payload = (await request.json()) as { login?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректный запрос." }, { status: 400 });
  }

  const login = (payload.login ?? "").trim();
  const password = payload.password ?? "";
  if (!login || !password) {
    return NextResponse.json({ ok: false, error: "Введите логин и пароль." }, { status: 400 });
  }

  const baseUrl = normalizeSupabaseUrl(supabaseUrl);

  let authUserId = "";
  let accessToken = "";
  let refreshToken = "";
  let lastError = "Неверный логин/пароль.";

  if (login.includes("@")) {
    const signIn = await signInWithEmail(baseUrl, supabaseAnonKey, login, password);
    if (!signIn.ok) {
      return NextResponse.json({ ok: false, error: signIn.error });
    }
    authUserId = signIn.data.user?.id ?? "";
    accessToken = signIn.data.access_token;
    refreshToken = signIn.data.refresh_token;
  } else {
    const signIn = await signInWithLogin(baseUrl, supabaseAnonKey, login, password);
    if (!signIn.ok) {
      return NextResponse.json({ ok: false, error: signIn.error }, { status: 401 });
    }
    authUserId = signIn.data.user?.id ?? "";
    accessToken = signIn.data.access_token;
    refreshToken = signIn.data.refresh_token;
  }

  if (!authUserId || !accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: lastError }, { status: 401 });
  }

  const profile =
    (await fetchProfileViaServiceRole(authUserId, login)) ??
    (await fetchProfileViaUserToken(baseUrl, supabaseAnonKey, accessToken, authUserId));
  if (!profile) {
    return NextResponse.json(
      { ok: false, error: "Профиль пользователя не найден в app_users." },
      { status: 404 },
    );
  }
  if (profile.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "Пользователь деактивирован администратором." },
      { status: 403 },
    );
  }

  const hasGranularContentPermissions = [
    profile.can_manage_news,
    profile.can_manage_tests,
    profile.can_manage_results,
    profile.can_manage_uav,
    profile.can_manage_counteraction,
    profile.can_manage_tactical_medicine,
    profile.can_reset_test_results,
    profile.can_manage_users,
    profile.can_view_user_list,
    profile.can_moderate_personnel,
  ].some((value) => typeof value === "boolean");

  const permissions =
    profile.role === "admin"
      ? {
          news: true,
          tests: true,
          results: true,
          resetResults: true,
          uav: true,
          counteraction: true,
          tacticalMedicine: true,
          userList: true,
          users: true,
          online: true,
          personnelModeration: true,
        }
      : hasGranularContentPermissions
        ? {
            news: profile.can_manage_news === true,
            tests: profile.can_manage_tests === true,
            results: profile.can_manage_results === true,
            resetResults: profile.can_reset_test_results === true,
            uav: profile.can_manage_uav === true,
            counteraction: profile.can_manage_counteraction === true,
            tacticalMedicine: profile.can_manage_tactical_medicine === true,
            userList: profile.can_view_user_list === true,
            users: profile.can_manage_users === true,
            online: profile.can_view_online === true,
            personnelModeration: profile.can_moderate_personnel === true,
          }
        : {
            news: profile.can_manage_content === true,
            tests: profile.can_manage_content === true,
            results: profile.can_manage_content === true,
            resetResults: false,
            uav: profile.can_manage_content === true,
            counteraction: profile.can_manage_content === true,
            tacticalMedicine: profile.can_manage_content === true,
            userList: profile.can_view_user_list === true,
            users: profile.can_manage_users === true,
            online: profile.can_view_online === true,
            personnelModeration: profile.can_moderate_personnel === true,
          };

  const unitRaw = profile.unit_assignment;
  const unitAssignment =
    unitRaw === "platoon_1" ||
    unitRaw === "platoon_2" ||
    unitRaw === "platoon_3" ||
    unitRaw === "company_4" ||
    unitRaw === "staff" ||
    unitRaw === "office"
      ? unitRaw
      : null;

  const session: SessionUser = {
    id: profile.id,
    role: profile.role,
    name: profile.name,
    callsign: profile.callsign,
    position: profile.position as SessionUser["position"],
    canManageContent:
      permissions.news ||
      permissions.tests ||
      permissions.uav ||
      permissions.counteraction ||
      permissions.tacticalMedicine,
    permissions,
    unitAssignment,
    avatarUrl: typeof profile.avatar_url === "string" && profile.avatar_url.trim() ? profile.avatar_url.trim() : null,
    nameColor: normalizeProfileNameColor(profile.profile_name_color),
  };

  const response = NextResponse.json({
    ok: true,
    session,
    auth: {
      accessToken,
      refreshToken,
    },
  });
  response.headers.append("Set-Cookie", serializeSessionCookie(session));
  return response;
}

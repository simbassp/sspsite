import { NextResponse } from "next/server";

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
  can_manage_users?: boolean;
  can_reset_test_results?: boolean;
  can_view_online?: boolean;
  status: "active" | "inactive";
};

const SUPABASE_REQUEST_TIMEOUT_MS = 10000;

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

async function resolveEmail(baseUrl: string, anonKey: string, login: string) {
  try {
    const response = await fetchWithTimeout(`${baseUrl}/rest/v1/rpc/resolve_login_email`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p_login: login }),
      cache: "no-store",
    });
    if (!response.ok) return "";
    const data = (await response.json()) as string | null;
    return typeof data === "string" ? data : "";
  } catch {
    return "";
  }
}

async function signInWithEmail(baseUrl: string, anonKey: string, email: string, password: string) {
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
    if (!response.ok || !data.access_token || !data.refresh_token) {
      return {
        ok: false as const,
        error: authError(data.error_description ?? data.msg ?? "auth_failed"),
      };
    }
    return { ok: true as const, data };
  } catch {
    return {
      ok: false as const,
      error: "Сервер авторизации временно недоступен. Повторите попытку.",
    };
  }
}

async function fetchProfile(baseUrl: string, anonKey: string, accessToken: string, authUserId: string) {
  const url = new URL(`${baseUrl}/rest/v1/app_users`);
  url.searchParams.set("select", "*");
  url.searchParams.set("auth_user_id", `eq.${authUserId}`);
  url.searchParams.set("limit", "1");
  try {
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
  const emailCandidates: string[] = [];
  if (login.includes("@")) {
    emailCandidates.push(login);
  } else {
    emailCandidates.push(`${login}@ssp.local`);
  }

  let authUserId = "";
  let accessToken = "";
  let refreshToken = "";
  let lastError = "Неверный логин/пароль.";

  for (const email of emailCandidates) {
    const signIn = await signInWithEmail(baseUrl, supabaseAnonKey, email, password);
    if (!signIn.ok) {
      lastError = signIn.error;
      continue;
    }
    authUserId = signIn.data.user?.id ?? "";
    accessToken = signIn.data.access_token;
    refreshToken = signIn.data.refresh_token;
    break;
  }

  if ((!authUserId || !accessToken || !refreshToken) && !login.includes("@")) {
    const resolved = await resolveEmail(baseUrl, supabaseAnonKey, login);
    if (resolved && !emailCandidates.includes(resolved)) {
      const signIn = await signInWithEmail(baseUrl, supabaseAnonKey, resolved, password);
      if (signIn.ok) {
        authUserId = signIn.data.user?.id ?? "";
        accessToken = signIn.data.access_token;
        refreshToken = signIn.data.refresh_token;
      } else {
        lastError = signIn.error;
      }
    }
  }

  if (!authUserId || !accessToken || !refreshToken) {
    return NextResponse.json({ ok: false, error: lastError });
  }

  const profile = await fetchProfile(baseUrl, supabaseAnonKey, accessToken, authUserId);
  if (!profile) {
    return NextResponse.json({ ok: false, error: "Профиль пользователя не найден в app_users." });
  }
  if (profile.status !== "active") {
    return NextResponse.json({ ok: false, error: "Пользователь деактивирован администратором." });
  }

  const hasGranularContentPermissions = [
    profile.can_manage_news,
    profile.can_manage_tests,
    profile.can_manage_results,
    profile.can_manage_uav,
    profile.can_manage_counteraction,
    profile.can_reset_test_results,
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
          users: true,
          online: true,
        }
      : hasGranularContentPermissions
        ? {
            news: profile.can_manage_news === true,
            tests: profile.can_manage_tests === true,
            results: profile.can_manage_results === true,
            resetResults: profile.can_reset_test_results === true,
            uav: profile.can_manage_uav === true,
            counteraction: profile.can_manage_counteraction === true,
            users: profile.can_manage_users === true,
            online: profile.can_view_online === true,
          }
        : {
            news: profile.can_manage_content === true,
            tests: profile.can_manage_content === true,
            results: profile.can_manage_content === true,
            resetResults: false,
            uav: profile.can_manage_content === true,
            counteraction: profile.can_manage_content === true,
            users: profile.can_manage_users === true,
            online: profile.can_view_online === true,
          };

  return NextResponse.json({
    ok: true,
    session: {
      id: profile.id,
      role: profile.role,
      name: profile.name,
      callsign: profile.callsign,
      position: profile.position,
      canManageContent: permissions.news || permissions.tests || permissions.uav || permissions.counteraction,
      permissions,
    },
    auth: {
      accessToken,
      refreshToken,
    },
  });
}

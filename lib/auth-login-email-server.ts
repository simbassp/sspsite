import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

const RESOLVE_LOGIN_RPC_TIMEOUT_MS = 12_000;

function normalizeSupabaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveLoginEmailViaRpc(baseUrl: string, anonKey: string, login: string) {
  try {
    const response = await fetchWithTimeout(
      `${normalizeSupabaseUrl(baseUrl)}/rest/v1/rpc/resolve_login_email`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ p_login: login }),
        cache: "no-store",
      },
      RESOLVE_LOGIN_RPC_TIMEOUT_MS,
    );
    if (!response.ok) return "";
    const data = (await response.json()) as string | null;
    return typeof data === "string" ? data.trim() : "";
  } catch {
    return "";
  }
}

async function resolveLoginEmailViaServiceRole(login: string) {
  try {
    const supabase = getServerSupabaseServiceClient();
    const profileQ = await supabase
      .from("app_users")
      .select("auth_user_id")
      .ilike("login", login)
      .eq("status", "active")
      .maybeSingle();
    if (profileQ.error || !profileQ.data) return "";

    const authUserId = profileQ.data.auth_user_id;
    if (typeof authUserId === "string" && authUserId) {
      const authUser = await supabase.auth.admin.getUserById(authUserId);
      const email = authUser.data.user?.email?.trim();
      if (email) return email;
    }

    return `${login.trim().toLowerCase()}@ssp.local`;
  } catch {
    return "";
  }
}

/** Email для сброса/входа: логин → auth email, без @ — только если профиль активен. */
export async function resolveActiveUserAuthEmail(
  loginOrEmail: string,
  supabase: { url: string; anonKey: string },
): Promise<string | null> {
  const trimmed = loginOrEmail.trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return trimmed;

  const fromRpc = await resolveLoginEmailViaRpc(supabase.url, supabase.anonKey, trimmed);
  if (fromRpc) return fromRpc;

  const fromDb = await resolveLoginEmailViaServiceRole(trimmed);
  return fromDb || null;
}

export function mapPasswordResetError(raw: string) {
  const msg = raw.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("too many")) {
    return "Слишком много запросов на сброс. Подождите минуту и попробуйте снова.";
  }
  if (msg.includes("redirect") || msg.includes("redirect_to")) {
    return "Ссылка сброса настроена неверно на сервере. Сообщите администратору.";
  }
  return raw.trim() || "Не удалось отправить ссылку для сброса.";
}

export async function sendSupabasePasswordResetEmail(input: {
  baseUrl: string;
  anonKey: string;
  email: string;
  redirectTo: string;
}) {
  try {
    const response = await fetchWithTimeout(
      `${normalizeSupabaseUrl(input.baseUrl)}/auth/v1/recover`,
      {
        method: "POST",
        headers: {
          apikey: input.anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          redirect_to: input.redirectTo,
        }),
        cache: "no-store",
      },
      25_000,
    );

    if (!response.ok) {
      let message = "recover_failed";
      try {
        const payload = (await response.json()) as { msg?: string; error_description?: string; message?: string };
        message = payload.error_description || payload.msg || payload.message || message;
      } catch {
        /* ignore */
      }
      return { ok: false as const, error: mapPasswordResetError(message) };
    }

    return { ok: true as const };
  } catch {
    return {
      ok: false as const,
      error: "Сервер авторизации временно недоступен. Попробуйте через минуту.",
    };
  }
}

export function resolvePasswordResetRedirectOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  const origin = request.headers.get("origin")?.trim();
  if (origin) return origin.replace(/\/$/, "");

  const host = request.headers.get("host")?.trim();
  if (host) {
    const proto = host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
    return `${proto}://${host}`;
  }

  return "https://pvossp.ru";
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { mapRecoveryLinkError } from "@/lib/reset-password-client-errors";

export const RECOVERY_SESSION_COOKIE = "ssp_pw_recovery";
const RECOVERY_COOKIE_MAX_AGE_SEC = 600;

export type RecoveryExchangeInput = {
  accessToken?: string | null;
  refreshToken?: string | null;
  code?: string | null;
  tokenHash?: string | null;
};

export function needsServerRecoveryExchange(searchParams: URLSearchParams) {
  return searchParams.has("code") || searchParams.has("token_hash") || searchParams.has("token");
}

export function isRecoveryRequest(pathname: string, searchParams: URLSearchParams) {
  if (pathname === "/auth/recovery") return true;
  if (pathname !== "/reset-password") return false;
  return (
    searchParams.get("type") === "recovery" ||
    needsServerRecoveryExchange(searchParams) ||
    (searchParams.has("access_token") && searchParams.has("refresh_token")) ||
    searchParams.has("recovery_error")
  );
}

export function getRecoverySupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function exchangeRecoverySession(
  input: RecoveryExchangeInput,
): Promise<{ ok: true; accessToken: string; refreshToken: string } | { ok: false; error: string }> {
  const supabase = getRecoverySupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "recovery_not_configured" };
  }

  try {
    const accessToken = typeof input.accessToken === "string" ? input.accessToken.trim() : "";
    const refreshToken = typeof input.refreshToken === "string" ? input.refreshToken.trim() : "";
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.session) {
        return { ok: false, error: mapRecoveryLinkError(error?.message || "invalid_recovery_session") };
      }
      return {
        ok: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }

    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        return { ok: false, error: mapRecoveryLinkError(error?.message || "invalid_recovery_code") };
      }
      return {
        ok: true,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }

    const tokenHash = typeof input.tokenHash === "string" ? input.tokenHash.trim() : "";
    if (tokenHash) {
      const verify = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });
      if (verify.error || !verify.data.session) {
        return { ok: false, error: mapRecoveryLinkError(verify.error?.message || "invalid_recovery_token") };
      }
      return {
        ok: true,
        accessToken: verify.data.session.access_token,
        refreshToken: verify.data.session.refresh_token,
      };
    }

    return { ok: false, error: "missing_recovery_token" };
  } catch (error) {
    return {
      ok: false,
      error: mapRecoveryLinkError(error instanceof Error ? error.message : "recovery_confirm_failed"),
    };
  }
}

export function buildCleanResetPasswordUrl(origin: string) {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("type", "recovery");
  return url;
}

/** @deprecated Используй buildCleanResetPasswordUrl + cookie. Оставлено для совместимости. */
export function buildResetPasswordRedirectUrl(
  origin: string,
  session: { accessToken: string; refreshToken: string },
) {
  const url = buildCleanResetPasswordUrl(origin);
  url.searchParams.set("access_token", session.accessToken);
  url.searchParams.set("refresh_token", session.refreshToken);
  return url;
}

function encodeRecoveryCookie(session: { accessToken: string; refreshToken: string }) {
  return Buffer.from(
    JSON.stringify({ accessToken: session.accessToken, refreshToken: session.refreshToken }),
    "utf-8",
  ).toString("base64url");
}

export function decodeRecoveryCookie(raw: string | undefined) {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as { accessToken?: string; refreshToken?: string };
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
    return { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
  } catch {
    return null;
  }
}

export function attachRecoverySessionCookie(
  response: NextResponse,
  session: { accessToken: string; refreshToken: string },
) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(RECOVERY_SESSION_COOKIE, encodeRecoveryCookie(session), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: RECOVERY_COOKIE_MAX_AGE_SEC,
  });
}

export function clearRecoverySessionCookie(response: NextResponse) {
  response.cookies.set(RECOVERY_SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export function createRecoverySuccessResponse(origin: string, session: { accessToken: string; refreshToken: string }) {
  const response = NextResponse.redirect(buildCleanResetPasswordUrl(origin));
  attachRecoverySessionCookie(response, session);
  return response;
}

export function createRecoveryFailureResponse(origin: string, error: string) {
  const url = buildCleanResetPasswordUrl(origin);
  url.searchParams.set("recovery_error", error);
  return NextResponse.redirect(url);
}

/** Куда Supabase редиректит после клика по письму (query-параметры, без hash — для мобильной почты). */
export function passwordResetRedirectUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/recovery`;
}

export async function handleRecoveryGet(request: Request, origin: string) {
  const url = new URL(request.url);

  const result = await exchangeRecoverySession({
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash") || url.searchParams.get("token"),
    accessToken: url.searchParams.get("access_token"),
    refreshToken: url.searchParams.get("refresh_token"),
  });

  if (!result.ok) {
    return createRecoveryFailureResponse(origin, result.error);
  }

  return createRecoverySuccessResponse(origin, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
}

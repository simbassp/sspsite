import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapRecoveryLinkError } from "@/lib/reset-password-client-errors";

export type RecoveryExchangeInput = {
  accessToken?: string | null;
  refreshToken?: string | null;
  code?: string | null;
  tokenHash?: string | null;
};

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

export function buildResetPasswordRedirectUrl(
  origin: string,
  session: { accessToken: string; refreshToken: string },
) {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("access_token", session.accessToken);
  url.searchParams.set("refresh_token", session.refreshToken);
  return url;
}

/** Куда Supabase редиректит после клика по письму (query-параметры, без hash — для мобильной почты). */
export function passwordResetRedirectUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/recovery`;
}

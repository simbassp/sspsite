import { createClient } from "@supabase/supabase-js";
import { mapRecoveryLinkError } from "@/lib/reset-password-client-errors";

export const runtime = "nodejs";

type RecoveryConfirmBody = {
  accessToken?: string | null;
  refreshToken?: string | null;
  code?: string | null;
  tokenHash?: string | null;
};

function sessionResponse(session: { access_token: string; refresh_token: string }) {
  return Response.json({
    ok: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "recovery_not_configured" }, { status: 500 });
  }

  let body: RecoveryConfirmBody = {};
  try {
    body = (await request.json()) as RecoveryConfirmBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken.trim() : "";
    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.session) {
        return Response.json(
          { ok: false, error: mapRecoveryLinkError(error?.message || "invalid_recovery_session") },
          { status: 400 },
        );
      }
      return sessionResponse(data.session);
    }

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.session) {
        return Response.json(
          { ok: false, error: mapRecoveryLinkError(error?.message || "invalid_recovery_code") },
          { status: 400 },
        );
      }
      return sessionResponse(data.session);
    }

    const tokenHash = typeof body.tokenHash === "string" ? body.tokenHash.trim() : "";
    if (tokenHash) {
      const verify = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });
      if (verify.error || !verify.data.session) {
        return Response.json(
          { ok: false, error: mapRecoveryLinkError(verify.error?.message || "invalid_recovery_token") },
          { status: 400 },
        );
      }
      return sessionResponse(verify.data.session);
    }

    return Response.json({ ok: false, error: "missing_recovery_token" }, { status: 400 });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: mapRecoveryLinkError(error instanceof Error ? error.message : "recovery_confirm_failed"),
      },
      { status: 400 },
    );
  }
}

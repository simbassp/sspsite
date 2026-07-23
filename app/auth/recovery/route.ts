import { NextResponse } from "next/server";
import {
  buildResetPasswordRedirectUrl,
  exchangeRecoverySession,
} from "@/lib/auth-recovery-server";
import { resolvePasswordResetRedirectOrigin } from "@/lib/auth-login-email-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = resolvePasswordResetRedirectOrigin(request);

  const result = await exchangeRecoverySession({
    code: url.searchParams.get("code"),
    tokenHash: url.searchParams.get("token_hash") || url.searchParams.get("token"),
    accessToken: url.searchParams.get("access_token"),
    refreshToken: url.searchParams.get("refresh_token"),
  });

  if (!result.ok) {
    const failUrl = new URL("/reset-password", origin);
    failUrl.searchParams.set("recovery_error", result.error);
    return NextResponse.redirect(failUrl);
  }

  return NextResponse.redirect(
    buildResetPasswordRedirectUrl(origin, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    }),
  );
}

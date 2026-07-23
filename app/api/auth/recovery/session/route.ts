import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearRecoverySessionCookie,
  decodeRecoveryCookie,
  RECOVERY_SESSION_COOKIE,
} from "@/lib/auth-recovery-server";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(RECOVERY_SESSION_COOKIE)?.value;
  const session = decodeRecoveryCookie(raw);
  if (!session) {
    return NextResponse.json({ ok: false, error: "no_recovery_session" }, { status: 404 });
  }

  const response = NextResponse.json({
    ok: true,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  });
  clearRecoverySessionCookie(response);
  return response;
}

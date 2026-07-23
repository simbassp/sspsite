import { exchangeRecoverySession } from "@/lib/auth-recovery-server";
import { mapRecoveryLinkError } from "@/lib/reset-password-client-errors";

export const runtime = "nodejs";

type RecoveryConfirmBody = {
  accessToken?: string | null;
  refreshToken?: string | null;
  code?: string | null;
  tokenHash?: string | null;
};

export async function POST(request: Request) {
  let body: RecoveryConfirmBody = {};
  try {
    body = (await request.json()) as RecoveryConfirmBody;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await exchangeRecoverySession(body);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  return Response.json({
    ok: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
}

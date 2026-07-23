import { handleRecoveryGet } from "@/lib/auth-recovery-server";
import { resolvePasswordResetRedirectOrigin } from "@/lib/auth-login-email-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const origin = resolvePasswordResetRedirectOrigin(request);
  return handleRecoveryGet(request, origin);
}

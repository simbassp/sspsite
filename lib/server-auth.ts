import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/seed";
import { parseSessionCookie } from "@/lib/auth";
import { isSessionStillValid } from "@/lib/server-session-validation";

export async function getServerSession(options?: { skipDbValidation?: boolean }) {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const session = parseSessionCookie(raw);
  if (!session) return null;
  if (options?.skipDbValidation) return session;
  const valid = await isSessionStillValid(session);
  return valid ? session : null;
}

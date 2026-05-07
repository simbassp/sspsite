import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/seed";
import { parseSessionCookie } from "@/lib/auth";
import { isSessionStillValid } from "@/lib/server-session-validation";

export async function getServerSession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const session = parseSessionCookie(raw);
  if (!session) return null;
  const valid = await isSessionStillValid(session);
  return valid ? session : null;
}

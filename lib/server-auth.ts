import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/seed";
import { parseSessionCookie } from "@/lib/auth";

export async function getServerSession() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return parseSessionCookie(raw);
}

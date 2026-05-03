import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

/** Точное сопоставление через ilike без %/_ в пользовательском вводе. */
function escapeIlikeExact(value: string) {
  return value.trim().replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Быстрая проверка занятости логина (app_users) и email (auth.users) до signUp.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; login?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; login?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const login = typeof body.login === "string" ? body.login.trim() : "";

  if (!email && !login) {
    return Response.json({ ok: true, emailTaken: false, loginTaken: false });
  }

  let supabase: ReturnType<typeof getServerSupabaseServiceClient>;
  try {
    supabase = getServerSupabaseServiceClient();
  } catch {
    return Response.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let emailTaken = false;
  let loginTaken = false;

  if (login.length > 0) {
    const pattern = escapeIlikeExact(login);
    const q = await supabase.from("app_users").select("id").ilike("login", pattern).limit(1);
    if (!q.error && Array.isArray(q.data) && q.data.length > 0) {
      loginTaken = true;
    }
  }

  if (email.length > 0 && email.includes("@")) {
    const rpc = await supabase.rpc("registration_email_taken", { p_email: email });
    if (!rpc.error && rpc.data === true) {
      emailTaken = true;
    }
  }

  return Response.json({ ok: true, emailTaken, loginTaken });
}

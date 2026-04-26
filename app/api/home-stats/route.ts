import { createClient } from "@supabase/supabase-js";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

/**
 * Сводка для «Главной»: одни и те же цифры для всех авторизованных.
 * Используется service role (если задан), иначе anon — при жёстком RLS счётчики могут отличаться.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [usersQ, newsQ] = await Promise.all([
    supabase.from("app_users").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("news").select("*", { count: "exact", head: true }),
  ]);

  if (usersQ.error || newsQ.error) {
    return Response.json(
      {
        ok: false,
        error: usersQ.error?.message || newsQ.error?.message || "count_failed",
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    activeUserCount: usersQ.count ?? 0,
    newsCount: newsQ.count ?? 0,
  });
}

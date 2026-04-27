import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

async function resolveUserIdsForHistory(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  sessionId: string,
) {
  const ids = new Set<string>([sessionId]);
  try {
    let byAppId = await supabase.from("app_users").select("id,auth_user_id").eq("id", sessionId).limit(1);
    if (byAppId.error && isMissingColumnError(byAppId.error.message)) {
      byAppId = await supabase.from("app_users").select("id").eq("id", sessionId).limit(1);
    }
    for (const row of (byAppId.data || []) as Array<Record<string, unknown>>) {
      if (row.id) ids.add(String(row.id));
      if (row.auth_user_id) ids.add(String(row.auth_user_id));
    }
  } catch {}
  try {
    const byAuthId = await supabase.from("app_users").select("id,auth_user_id").eq("auth_user_id", sessionId).limit(1);
    if (!byAuthId.error) {
      for (const row of (byAuthId.data || []) as Array<Record<string, unknown>>) {
        if (row.id) ids.add(String(row.id));
        if (row.auth_user_id) ids.add(String(row.auth_user_id));
      }
    }
  } catch {}
  return Array.from(ids);
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const supabase = getServerSupabaseServiceClient();
    const userIds = await resolveUserIdsForHistory(supabase, session.id);
    const primaryQ = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false })
      .limit(20);
    let queryRows: unknown[] = (primaryQ.data as unknown[]) || [];
    let queryError: string | null = primaryQ.error?.message || null;
    if (primaryQ.error && isMissingColumnError(primaryQ.error.message)) {
      const legacyQ = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(20);
      queryRows = (legacyQ.data as unknown[]) || [];
      queryError = legacyQ.error?.message || null;
    }
    if (queryError) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/tests/history] query error", { userId: session.id, message: queryError });
      }
      return Response.json({ ok: false, error: queryError }, { status: 500 });
    }
    const rows = (queryRows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type ?? r.test_type,
      status: r.status,
      score: r.score,
      created_at: r.created_at,
    }));
    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/tests/history] ok", { userId: session.id, candidates: userIds, count: rows.length });
    }
    return Response.json({ ok: true, rows });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "tests_history_exception" },
      { status: 500 },
    );
  }
}

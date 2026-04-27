import { canManageResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const usersQ = await supabase.from("app_users").select("id,name,callsign,role,status").limit(1000);
    const resultsPrimaryQ = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at")
      .eq("type", "final")
      .order("created_at", { ascending: false })
      .limit(3000);
    let resultsRows: Array<Record<string, unknown>> = (resultsPrimaryQ.data || []) as Array<Record<string, unknown>>;
    let resultsError: string | null = resultsPrimaryQ.error?.message || null;
    if (resultsPrimaryQ.error && isMissingColumnError(resultsPrimaryQ.error.message)) {
      const resultsLegacyQ = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .eq("test_type", "final")
        .order("created_at", { ascending: false })
        .limit(3000);
      resultsRows = (resultsLegacyQ.data || []) as Array<Record<string, unknown>>;
      resultsError = resultsLegacyQ.error?.message || null;
    }

    if (usersQ.error || resultsError) {
      return Response.json(
        { ok: false, error: usersQ.error?.message || resultsError || "admin_results_failed" },
        { status: 500 },
      );
    }

    return Response.json({
      ok: true,
      users: usersQ.data || [],
      results: resultsRows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type ?? r.test_type,
        status: r.status,
        score: r.score,
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_results_exception" },
      { status: 500 },
    );
  }
}

import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const resultsPrimaryQ = await supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(20);
    let resultsRows: Array<Record<string, unknown>> = (resultsPrimaryQ.data || []) as Array<Record<string, unknown>>;
    let resultsError: string | null = resultsPrimaryQ.error?.message || null;
    if (resultsPrimaryQ.error && isMissingColumnError(resultsPrimaryQ.error.message)) {
      const resultsLegacyQ = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20);
      resultsRows = (resultsLegacyQ.data || []) as Array<Record<string, unknown>>;
      resultsError = resultsLegacyQ.error?.message || null;
    }
    const profilePrimaryQ = await supabase.from("app_users").select("auth_user_id").eq("id", session.id).maybeSingle();
    let profileRow: Record<string, unknown> | null = (profilePrimaryQ.data || null) as Record<string, unknown> | null;
    let profileError: string | null = profilePrimaryQ.error?.message || null;
    if (profilePrimaryQ.error && isMissingColumnError(profilePrimaryQ.error.message)) {
      const profileLegacyQ = await supabase.from("app_users").select("id").eq("id", session.id).maybeSingle();
      profileRow = (profileLegacyQ.data || null) as Record<string, unknown> | null;
      profileError = profileLegacyQ.error?.message || null;
    }

    if (resultsError || profileError) {
      return Response.json(
        { ok: false, error: resultsError || profileError || "profile_bootstrap_failed" },
        { status: 500 },
      );
    }

    let email = "";
    const authUserId = typeof profileRow?.auth_user_id === "string" ? profileRow.auth_user_id : null;
    if (authUserId) {
      try {
        const authInfo = await supabase.auth.admin.getUserById(authUserId);
        email = authInfo.data.user?.email || "";
      } catch {}
    }

    let inviteCodes: Array<Record<string, unknown>> = [];
    if (session.role === "admin") {
      const invitesQ = await supabase
        .from("registration_invites")
        .select("code,is_active,max_uses,used_count,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!invitesQ.error) inviteCodes = invitesQ.data || [];
    }

    let config: Record<string, unknown> | null = null;
    const configQ = await supabase
      .from("test_settings")
      .select("final_question_count,time_per_question_sec")
      .eq("id", 1)
      .maybeSingle();
    if (!configQ.error && configQ.data) {
      config = configQ.data as Record<string, unknown>;
    }

    return Response.json({
      ok: true,
      email,
      results: resultsRows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type ?? r.test_type,
        status: r.status,
        score: r.score,
        created_at: r.created_at,
        questions_total: r.questions_total ?? null,
        questions_correct: r.questions_correct ?? null,
      })),
      inviteCodes,
      config,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_bootstrap_exception" },
      { status: 500 },
    );
  }
}

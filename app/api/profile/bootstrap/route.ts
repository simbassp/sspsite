import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const [resultsQ, profileQ] = await Promise.all([
      supabase
        .from("test_results")
        .select("id,user_id,type,status,score,created_at")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("app_users").select("auth_user_id").eq("id", session.id).maybeSingle(),
    ]);

    if (resultsQ.error || profileQ.error) {
      return Response.json(
        { ok: false, error: resultsQ.error?.message || profileQ.error?.message || "profile_bootstrap_failed" },
        { status: 500 },
      );
    }

    let email = "";
    const authUserId = profileQ.data?.auth_user_id || null;
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

    return Response.json({
      ok: true,
      email,
      results: resultsQ.data || [],
      inviteCodes,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_bootstrap_exception" },
      { status: 500 },
    );
  }
}

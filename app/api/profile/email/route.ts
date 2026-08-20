import { resolveProfileAuthEmail } from "@/lib/profile-auth-email-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const profileQ = await supabase
      .from("app_users")
      .select("auth_user_id,login")
      .eq("id", session.id)
      .maybeSingle();

    if (profileQ.error || !profileQ.data) {
      return Response.json({ ok: false, error: profileQ.error?.message || "profile_not_found" }, { status: 404 });
    }

    const email = await resolveProfileAuthEmail(supabase, {
      userId: session.id,
      authUserId: profileQ.data.auth_user_id,
      login: profileQ.data.login,
    });

    return Response.json({ ok: true, email });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_email_exception" },
      { status: 500 },
    );
  }
}

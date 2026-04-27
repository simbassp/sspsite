import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { targetUserId?: string };
  try {
    body = (await req.json()) as { targetUserId?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const targetUserId = String(body.targetUserId || "").trim();
  if (!targetUserId) {
    return Response.json({ ok: false, error: "missing_target_user_id" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const nowIso = new Date().toISOString();

    const upd = await supabase.from("app_users").update({ final_test_counting_from: nowIso }).eq("id", targetUserId);

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "migration_required_final_test_counting_from" },
          { status: 500 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    const ins = await supabase.from("final_attempt_reset_events").insert({
      target_user_id: targetUserId,
      admin_user_id: session.id,
    });

    if (ins.error && process.env.NODE_ENV !== "production") {
      console.debug("[reset-final] audit insert", ins.error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reset_final_exception" },
      { status: 500 },
    );
  }
}

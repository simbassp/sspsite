import { canResetTestResults } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function POST() {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const nowIso = new Date().toISOString();

    const upd = await supabase
      .from("app_users")
      .update({ final_test_counting_from: nowIso }, { count: "exact" })
      .not("id", "is", null);

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "migration_required_final_test_counting_from" },
          { status: 500 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    const resetCount = typeof upd.count === "number" ? upd.count : 0;

    const ins = await supabase.from("final_attempt_reset_events").insert({
      target_user_id: null,
      admin_user_id: session.id,
    });

    // Если миграция ещё не применена (target_user_id NOT NULL), аудит не блокирует сброс.
    if (ins.error) {
      const fallback = await supabase.from("final_attempt_reset_events").insert({
        target_user_id: session.id,
        admin_user_id: session.id,
      });
      if (fallback.error && process.env.NODE_ENV !== "production") {
        console.debug("[reset-final-all] audit insert", fallback.error.message);
      }
    }

    return Response.json({
      ok: true,
      resetCount,
      audit: {
        created_at: nowIso,
        admin_name: `${session.name ?? ""} ${session.callsign ?? ""}`.trim() || "—",
        target_name: "всем пользователям",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reset_final_all_exception" },
      { status: 500 },
    );
  }
}

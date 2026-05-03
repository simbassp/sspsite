import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    (m.includes("could not find") && m.includes("column"))
  );
}

/**
 * Удаляем все пробные попытки пользователя.
 * В БД может быть либо колонка `type`, либо устаревшая `test_type`, либо обе;
 * один DELETE с type=trial не трогает строки, где заполнен только test_type.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();

    const delByType = await supabase.from("test_results").delete().eq("user_id", session.id).eq("type", "trial");
    if (delByType.error && !isMissingColumnError(delByType.error.message)) {
      return Response.json({ ok: false, error: delByType.error.message }, { status: 500 });
    }

    const delByTestType = await supabase
      .from("test_results")
      .delete()
      .eq("user_id", session.id)
      .eq("test_type", "trial");
    if (delByTestType.error && !isMissingColumnError(delByTestType.error.message)) {
      return Response.json({ ok: false, error: delByTestType.error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_reset_stats_exception" },
      { status: 500 },
    );
  }
}

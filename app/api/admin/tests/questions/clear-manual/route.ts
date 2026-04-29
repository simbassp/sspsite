import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const before = await supabase.from("test_questions").select("id", { count: "exact", head: true });
    if (before.error) {
      return Response.json({ ok: false, error: before.error.message }, { status: 500 });
    }
    if (!before.count || before.count <= 0) {
      return Response.json({ ok: true, deleted: 0 });
    }

    const remove = await supabase.from("test_questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (remove.error) {
      return Response.json({ ok: false, error: remove.error.message }, { status: 500 });
    }
    return Response.json({ ok: true, deleted: before.count });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "clear_manual_questions_exception" },
      { status: 500 },
    );
  }
}

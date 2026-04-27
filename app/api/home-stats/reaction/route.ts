import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

const ALLOWED_CARD_KEYS = new Set(["newcomer", "departed", "promoted", "commander"]);
const ALLOWED_EMOJIS = new Set(["👍", "🔥", "👏", "🫡", "❤️"]);

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as { cardKey?: unknown; emoji?: unknown };
    const cardKey = String(body.cardKey || "");
    const emoji = String(body.emoji || "");
    if (!ALLOWED_CARD_KEYS.has(cardKey) || !ALLOWED_EMOJIS.has(emoji)) {
      return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    const newestQ = await supabase.from("app_users").select("created_at").order("created_at", { ascending: false }).limit(1);
    const leftQ = await supabase
      .from("dashboard_events")
      .select("created_at")
      .eq("kind", "user_deleted")
      .order("created_at", { ascending: false })
      .limit(1);
    const newest = Array.isArray(newestQ.data) ? newestQ.data[0] : null;
    const left = Array.isArray(leftQ.data) ? leftQ.data[0] : null;
    const scopeKey = `${newest?.created_at ?? "none"}|${left?.created_at ?? "none"}`;

    let existingAny = await supabase
      .from("dashboard_reactions")
      .select("id,emoji")
      .eq("card_key", cardKey)
      .eq("user_id", session.id)
      .eq("scope_key", scopeKey)
      .limit(10);
    if (existingAny.error && isMissingColumnError(existingAny.error.message)) {
      existingAny = await supabase
        .from("dashboard_reactions")
        .select("id,emoji")
        .eq("card_key", cardKey)
        .eq("user_id", session.id)
        .limit(10);
    }

    if (existingAny.error) {
      return Response.json({ ok: false, error: existingAny.error.message || "reaction_read_failed" }, { status: 500 });
    }

    const existingRows = Array.isArray(existingAny.data) ? existingAny.data : [];
    if (existingRows.length > 0) {
      const ids = existingRows.map((r) => r.id);
      const clearQ = await supabase.from("dashboard_reactions").delete().in("id", ids);
      if (clearQ.error) {
        return Response.json({ ok: false, error: clearQ.error.message || "reaction_clear_failed" }, { status: 500 });
      }
    }

    let insertQ = await supabase
      .from("dashboard_reactions")
      .insert({ card_key: cardKey, emoji, user_id: session.id, scope_key: scopeKey });
    if (insertQ.error && isMissingColumnError(insertQ.error.message)) {
      insertQ = await supabase.from("dashboard_reactions").insert({ card_key: cardKey, emoji, user_id: session.id });
    }
    if (insertQ.error) {
      return Response.json({ ok: false, error: insertQ.error.message || "reaction_insert_failed" }, { status: 500 });
    }
    return Response.json({ ok: true, active: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reaction_exception" },
      { status: 500 },
    );
  }
}

import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

const ALLOWED_CARD_KEYS = new Set(["newcomer", "departed", "promoted", "commander"]);
const ALLOWED_EMOJIS = new Set(["👍", "🔥", "👏", "🫡", "❤️"]);

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
    const existingAny = await supabase
      .from("dashboard_reactions")
      .select("id,emoji")
      .eq("card_key", cardKey)
      .eq("user_id", session.id)
      .limit(10);

    if (existingAny.error) {
      return Response.json({ ok: false, error: existingAny.error.message || "reaction_read_failed" }, { status: 500 });
    }

    const existingRows = Array.isArray(existingAny.data) ? existingAny.data : [];
    const sameReaction = existingRows.find((r) => String((r as { emoji?: unknown }).emoji || "") === emoji);

    if (sameReaction) {
      const deleteSame = await supabase.from("dashboard_reactions").delete().eq("id", sameReaction.id);
      if (deleteSame.error) {
        return Response.json({ ok: false, error: deleteSame.error.message || "reaction_delete_failed" }, { status: 500 });
      }
      return Response.json({ ok: true, active: false });
    }

    if (existingRows.length > 0) {
      const ids = existingRows.map((r) => r.id);
      const clearQ = await supabase.from("dashboard_reactions").delete().in("id", ids);
      if (clearQ.error) {
        return Response.json({ ok: false, error: clearQ.error.message || "reaction_clear_failed" }, { status: 500 });
      }
    }

    const insertQ = await supabase
      .from("dashboard_reactions")
      .insert({ card_key: cardKey, emoji, user_id: session.id });
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

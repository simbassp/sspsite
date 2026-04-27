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
    const existing = await supabase
      .from("dashboard_reactions")
      .select("id")
      .eq("card_key", cardKey)
      .eq("emoji", emoji)
      .eq("user_id", session.id)
      .maybeSingle();

    if (existing.error) {
      return Response.json({ ok: false, error: existing.error.message || "reaction_read_failed" }, { status: 500 });
    }

    if (existing.data?.id) {
      const removeQ = await supabase.from("dashboard_reactions").delete().eq("id", existing.data.id);
      if (removeQ.error) {
        return Response.json({ ok: false, error: removeQ.error.message || "reaction_delete_failed" }, { status: 500 });
      }
      return Response.json({ ok: true, active: false });
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

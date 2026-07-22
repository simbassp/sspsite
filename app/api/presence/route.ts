import { isMissingColumnError } from "@/lib/server-final-user-context";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type PresenceBody = {
  online?: unknown;
  newSession?: unknown;
  elapsedSeconds?: unknown;
};

function isTransientSupabaseError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("enotfound") ||
    m.includes("abort") ||
    m.includes("socket")
  );
}

async function readPresenceBody(request: Request): Promise<PresenceBody> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as PresenceBody;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  let session;
  try {
    session = await getServerSession();
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "session_check_failed" },
      { status: 500 },
    );
  }
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const body = await readPresenceBody(request);
    const online = body.online === true;
    const newSession = body.newSession === true;
    const elapsedRaw = typeof body.elapsedSeconds === "number" ? body.elapsedSeconds : Number(body.elapsedSeconds);
    const elapsedSeconds =
      Number.isFinite(elapsedRaw) && elapsedRaw > 0 ? Math.max(0, Math.min(Math.floor(elapsedRaw), 600)) : 0;

    let supabase;
    try {
      supabase = getServerSupabaseServiceClient();
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : "backend_unavailable" },
        { status: 503 },
      );
    }

    const patch = online
      ? { is_online: true, last_seen_at: new Date().toISOString() }
      : { is_online: false };
    let q = await supabase.from("app_users").update(patch).eq("id", session.id);
    if (q.error && online && q.error.message.toLowerCase().includes("last_seen_at")) {
      q = await supabase.from("app_users").update({ is_online: true }).eq("id", session.id);
    }
    if (q.error) {
      if (isMissingColumnError(q.error.message) || isTransientSupabaseError(q.error.message)) {
        return Response.json({ ok: true, skipped: true });
      }
      console.error("[presence] update failed:", q.error.message);
      return Response.json({ ok: false, error: q.error.message || "presence_update_failed" }, { status: 500 });
    }

    if (newSession || elapsedSeconds > 0) {
      const analytics = await supabase.rpc("record_site_analytics", {
        p_user_id: session.id,
        p_new_session: newSession,
        p_elapsed_seconds: elapsedSeconds,
      });
      if (analytics.error) {
        const msg = analytics.error.message.toLowerCase();
        const skippable =
          msg.includes("record_site_analytics") ||
          msg.includes("does not exist") ||
          msg.includes("could not find") ||
          msg.includes("permission denied");
        if (!skippable) {
          console.warn("[presence] analytics skipped:", analytics.error.message);
        }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "presence_exception";
    if (isTransientSupabaseError(message)) {
      return Response.json({ ok: true, skipped: true });
    }
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

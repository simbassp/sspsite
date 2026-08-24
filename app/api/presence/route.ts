import { isMissingColumnError } from "@/lib/server-final-user-context";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { scheduleStaleOnlineCleanup } from "@/lib/presence-stale-cleanup";

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
    session = await getServerSession({ skipDbValidation: true });
  } catch {
    return Response.json({ ok: true, skipped: true });
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
      supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 4_000 });
    } catch {
      return Response.json({ ok: true, skipped: true });
    }

    const patch = online
      ? { is_online: true, last_seen_at: new Date().toISOString() }
      : { is_online: false };
    let q = await supabase.from("app_users").update(patch).eq("id", session.id);
    if (q.error && online && q.error.message.toLowerCase().includes("last_seen_at")) {
      q = await supabase.from("app_users").update({ is_online: true }).eq("id", session.id);
    }
    if (q.error) {
      return Response.json({ ok: true, skipped: true });
    }

    scheduleStaleOnlineCleanup(supabase);

    if (newSession || elapsedSeconds > 0) {
      void supabase
        .rpc("record_site_analytics", {
          p_user_id: session.id,
          p_new_session: newSession,
          p_elapsed_seconds: elapsedSeconds,
        })
        .then(({ error }) => {
          if (!error) return;
          if (isMissingColumnError(error.message) || isTransientSupabaseError(error.message)) return;
        })
        .catch(() => undefined);
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: true, skipped: true });
  }
}

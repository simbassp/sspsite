import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { canManageUsers, canViewUserList } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= ONLINE_LAST_SEEN_MAX_MS;
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || (!canManageUsers(session) && !canViewUserList(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  if (userId === session.id) {
    return Response.json({ ok: false, error: "use_own_profile" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();

    const userPrimary = await supabase
      .from("app_users")
      .select(
        "id,name,callsign,position,role,status,login,is_online,last_seen_at,duty_location",
      )
      .eq("id", userId)
      .maybeSingle();

    let userRow: Record<string, unknown> | null = (userPrimary.data || null) as Record<string, unknown> | null;
    let userErr = userPrimary.error?.message || null;
    let onlineFromFlagOnly = false;
    let dutyFromDb = true;

    if (userPrimary.error && isMissingColumnError(userPrimary.error.message)) {
      dutyFromDb = false;
      const fallback = await supabase
        .from("app_users")
        .select("id,name,callsign,position,role,status,login,is_online")
        .eq("id", userId)
        .maybeSingle();
      userRow = (fallback.data || null) as Record<string, unknown> | null;
      userErr = fallback.error?.message || null;
      onlineFromFlagOnly = true;
    }

    if (userErr) {
      return Response.json({ ok: false, error: userErr }, { status: 500 });
    }
    if (!userRow) {
      return Response.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    const resultsPrimaryQ = await supabase
      .from("test_results")
      .select(
        "id,user_id,type,status,score,created_at,started_at,finished_at,duration_seconds,is_completed,questions_total,questions_correct",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    let resultsRows: Array<Record<string, unknown>> = (resultsPrimaryQ.data || []) as Array<Record<string, unknown>>;
    let resultsError: string | null = resultsPrimaryQ.error?.message || null;

    if (resultsPrimaryQ.error && isMissingColumnError(resultsPrimaryQ.error.message)) {
      const legacy = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at,questions_total,questions_correct")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);
      resultsRows = (legacy.data || []) as Array<Record<string, unknown>>;
      resultsError = legacy.error?.message || null;
    }

    if (resultsError) {
      return Response.json({ ok: false, error: resultsError }, { status: 500 });
    }

    const isOnline = onlineFromFlagOnly
      ? userRow.is_online === true
      : effectiveOnlineStrict(userRow.is_online, userRow.last_seen_at);

    const dutyLocation =
      dutyFromDb &&
      typeof userRow.duty_location === "string" &&
      userRow.duty_location.trim().toLowerCase() === "deployment"
        ? "deployment"
        : "base";

    return Response.json({
      ok: true,
      user: {
        id: String(userRow.id),
        name: typeof userRow.name === "string" ? userRow.name : "",
        callsign: typeof userRow.callsign === "string" ? userRow.callsign : "",
        position: typeof userRow.position === "string" ? userRow.position : "",
        login: typeof userRow.login === "string" ? userRow.login : "",
        role: userRow.role === "admin" ? "admin" : "employee",
        status: userRow.status === "inactive" ? "inactive" : "active",
        is_online: isOnline,
        duty_location: dutyLocation,
      },
      results: resultsRows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type ?? r.test_type,
        status: r.status,
        score: r.score,
        created_at: r.created_at,
        started_at: r.started_at ?? null,
        finished_at: r.finished_at ?? null,
        duration_seconds: r.duration_seconds ?? null,
        is_completed: r.is_completed ?? null,
        questions_total: r.questions_total ?? null,
        questions_correct: r.questions_correct ?? null,
      })),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_user_exception" },
      { status: 500 },
    );
  }
}

import { formatFinalTestClosureMessage, fromDatetimeLocalInputValue } from "@/lib/final-test-closure";
import {
  evaluateFinalTestClosure,
  type FinalTestClosureSettings,
} from "@/lib/final-test-closure";
import {
  loadFinalTestClosureSettings,
  saveFinalTestClosureSettings,
} from "@/lib/final-test-closure-server";
import { formatDateTime } from "@/lib/format";
import { formatNotificationSenderLabel, sendAdminBroadcast } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function parseSettings(body: {
  closedFrom?: unknown;
  closedUntil?: unknown;
  message?: unknown;
  clear?: unknown;
}): FinalTestClosureSettings | { error: string } {
  if (body.clear === true) {
    return { closedFrom: null, closedUntil: null, message: null };
  }

  const closedFromRaw = body.closedFrom;
  const closedUntilRaw = body.closedUntil;
  const closedFrom =
    closedFromRaw == null || closedFromRaw === ""
      ? null
      : typeof closedFromRaw === "string" && closedFromRaw.includes("T") && !closedFromRaw.endsWith("Z")
        ? fromDatetimeLocalInputValue(String(closedFromRaw))
        : String(closedFromRaw);
  const closedUntil =
    closedUntilRaw == null || closedUntilRaw === ""
      ? null
      : typeof closedUntilRaw === "string" && closedUntilRaw.includes("T") && !closedUntilRaw.endsWith("Z")
        ? fromDatetimeLocalInputValue(String(closedUntilRaw))
        : String(closedUntilRaw);

  if (closedFrom && Number.isNaN(new Date(closedFrom).getTime())) {
    return { error: "invalid_closed_from" };
  }
  if (closedUntil && Number.isNaN(new Date(closedUntil).getTime())) {
    return { error: "invalid_closed_until" };
  }
  if (closedFrom && closedUntil && new Date(closedFrom).getTime() > new Date(closedUntil).getTime()) {
    return { error: "invalid_closure_range" };
  }

  const message = String(body.message ?? "").trim() || null;
  return { closedFrom, closedUntil, message };
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const settings = await loadFinalTestClosureSettings(supabase);
    const status = evaluateFinalTestClosure(settings);
    return Response.json({
      ok: true,
      settings,
      status,
      displayMessage: formatFinalTestClosureMessage(status, formatDateTime),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "closure_load_exception" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as {
      closedFrom?: unknown;
      closedUntil?: unknown;
      message?: unknown;
      clear?: unknown;
      notify?: unknown;
      notifyTitle?: unknown;
    };
    const parsed = parseSettings(body);
    if ("error" in parsed) {
      return Response.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    const saved = await saveFinalTestClosureSettings(supabase, parsed);
    if (!saved.ok) {
      return Response.json({ ok: false, error: saved.error }, { status: 500 });
    }

    const status = evaluateFinalTestClosure(saved.settings);
    let notified = 0;

    if (body.notify === true) {
      const title = String(body.notifyTitle ?? "").trim() || "Итоговый тест: изменение доступа";
      const text = formatFinalTestClosureMessage(status, formatDateTime);
      const sender = {
        id: session.id,
        label:
          formatNotificationSenderLabel({
            name: session.name,
            callsign: session.callsign,
            role: session.role,
          }) ?? "Администратор",
      };
      const broadcast = await sendAdminBroadcast(title, text, "/tests", sender);
      if (broadcast.ok) notified = broadcast.sent;
    }

    return Response.json({
      ok: true,
      settings: saved.settings,
      status,
      displayMessage: formatFinalTestClosureMessage(status, formatDateTime),
      notified,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "closure_save_exception" },
      { status: 500 },
    );
  }
}

import { canResetTestResults } from "@/lib/permissions";
import { resetPersonnelExams } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canResetTestResults(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (body ?? {}) as {
    scope?: unknown;
    userId?: unknown;
    platoon?: unknown;
    section?: unknown;
    search?: unknown;
  };

  const scope = raw.scope === "single" || raw.scope === "all" || raw.scope === "filter" ? raw.scope : null;
  if (!scope) {
    return Response.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  }

  if (scope === "single") {
    const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
    if (!userId || !looksLikeUuid(userId)) {
      return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
    }
  }

  const platoonRaw = raw.platoon;
  const sectionRaw = raw.section;
  const platoon =
    platoonRaw === "all" || platoonRaw === null || platoonRaw === undefined || platoonRaw === ""
      ? ("all" as const)
      : Number(platoonRaw) === 1 || Number(platoonRaw) === 2
        ? (Number(platoonRaw) as 1 | 2)
        : null;
  const section =
    sectionRaw === "all" || sectionRaw === null || sectionRaw === undefined || sectionRaw === ""
      ? ("all" as const)
      : [1, 2, 3, 4].includes(Number(sectionRaw))
        ? (Number(sectionRaw) as 1 | 2 | 3 | 4)
        : null;

  if (scope === "filter" && (platoon === null || section === null)) {
    return Response.json({ ok: false, error: "invalid_filter" }, { status: 400 });
  }

  try {
    const result = await resetPersonnelExams({
      scope,
      userId: typeof raw.userId === "string" ? raw.userId : undefined,
      platoon: platoon ?? "all",
      section: section ?? "all",
      search: typeof raw.search === "string" ? raw.search : "",
    });

    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }

    return Response.json({ ok: true, affectedUsers: result.affectedUsers });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "reset_personnel_exams_exception" },
      { status: 500 },
    );
  }
}

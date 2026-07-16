import { normalizeEmploymentDateInput } from "@/lib/employment-date";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = (body ?? {}) as { employmentDate?: unknown };
  const employmentDate = normalizeEmploymentDateInput(raw.employmentDate);
  if (raw.employmentDate !== undefined && raw.employmentDate !== null && raw.employmentDate !== "" && employmentDate === null) {
    return Response.json({ ok: false, error: "invalid_employment_date" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const upd = await supabase
      .from("app_users")
      .update({ employment_date: employmentDate })
      .eq("id", session.id)
      .select("employment_date")
      .maybeSingle();

    if (upd.error) {
      if (isMissingColumnError(upd.error.message)) {
        return Response.json(
          { ok: false, error: "Колонка employment_date отсутствует. Примените миграции Supabase." },
          { status: 503 },
        );
      }
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }

    const saved = upd.data?.employment_date ? String(upd.data.employment_date).slice(0, 10) : null;
    return Response.json({ ok: true, employmentDate: saved });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "employment_date_patch_exception" },
      { status: 500 },
    );
  }
}

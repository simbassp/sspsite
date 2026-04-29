import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function extractMissingColumn(message: string | undefined): string | null {
  const m = message || "";
  const schemaCacheMatch = m.match(/Could not find the '([^']+)' column/i);
  if (schemaCacheMatch?.[1]) return schemaCacheMatch[1];
  const sqlMatch = m.match(/column ["`]?([^"'`\s]+)["`]? does not exist/i);
  if (sqlMatch?.[1]) return sqlMatch[1];
  return null;
}

function deleteKeyInsensitive(payload: Record<string, unknown>, key: string): boolean {
  const exact = Object.keys(payload).find((k) => k.toLowerCase() === key.toLowerCase());
  if (!exact) return false;
  delete payload[exact];
  return true;
}

function mapQuestionRow(row: Record<string, unknown>, index: number) {
  const rawOptions = row.options ?? row.answers ?? row.variants ?? row.answer_options ?? [];
  let options: string[] = [];
  if (Array.isArray(rawOptions)) {
    options = rawOptions.map((item) => String(item));
  } else if (typeof rawOptions === "string") {
    try {
      const parsed = JSON.parse(rawOptions);
      options = Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      options = rawOptions
        .split(/\r?\n|;/g)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return {
    id: String(row.id ?? row.question_id ?? `legacy-${index + 1}`),
    type: (row.type ?? row.test_type) === "trial" ? "trial" : "final",
    text: String(row.text ?? row.question_text ?? row.question ?? ""),
    options,
    correct_index: Number(row.correct_index ?? row.correct_answer_index ?? row.correct_option ?? row.correct_answer ?? 0),
    time_limit_sec: Math.max(5, Number(row.time_limit_sec ?? row.time_sec ?? row.time_limit ?? 20)),
    order_index: Math.max(1, Number(row.order_index ?? row.sort_order ?? row.order ?? index + 1)),
    is_active: Boolean(row.is_active ?? row.active ?? row.enabled ?? true),
    created_at: String(row.created_at ?? row.created ?? new Date().toISOString()),
  };
}

async function listQuestions() {
  const supabase = getServerSupabaseServiceClient();
  const wildcard = await supabase.from("test_questions").select("*").limit(2000);
  if (wildcard.error) return { error: wildcard.error.message, data: [] as Array<Record<string, unknown>> };
  const rows = (wildcard.data || []) as Array<Record<string, unknown>>;
  const mapped = rows.map(mapQuestionRow).sort((a, b) => `${a.type}`.localeCompare(`${b.type}`) || a.order_index - b.order_index);
  return { error: null as string | null, data: mapped };
}

async function resolveTestIdCandidates(supabase: ReturnType<typeof getServerSupabaseServiceClient>) {
  const candidates: unknown[] = [];
  const push = (value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    if (!candidates.some((v) => String(v) === String(value))) candidates.push(value);
  };

  const fromQuestions = await supabase
    .from("test_questions")
    .select("test_id")
    .not("test_id", "is", null)
    .limit(10);
  if (!fromQuestions.error) {
    for (const row of (fromQuestions.data || []) as Array<Record<string, unknown>>) push(row.test_id);
  }

  const fromResults = await supabase.from("test_results").select("test_id").not("test_id", "is", null).limit(10);
  if (!fromResults.error) {
    for (const row of (fromResults.data || []) as Array<Record<string, unknown>>) push(row.test_id);
  }

  const testsTable = await supabase.from("tests").select("id").limit(10);
  if (!testsTable.error) {
    for (const row of (testsTable.data || []) as Array<Record<string, unknown>>) push(row.id);
  }

  const legacyTestsTable = await supabase.from("test").select("id").limit(10);
  if (!legacyTestsTable.error) {
    for (const row of (legacyTestsTable.data || []) as Array<Record<string, unknown>>) push(row.id);
  }

  push(1);
  push("1");
  push("00000000-0000-0000-0000-000000000000");
  return candidates;
}

export async function GET() {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const listed = await listQuestions();
  if (listed.error) return Response.json({ ok: false, error: listed.error }, { status: 500 });
  return Response.json({ ok: true, questions: listed.data });
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as {
    id?: string;
    type?: string;
    text?: string;
    options?: unknown;
    correctIndex?: number;
    timeLimitSec?: number;
    order?: number;
    isActive?: boolean;
  };

  const supabase = getServerSupabaseServiceClient();
  const base = {
    type: body.type === "trial" ? "trial" : "final",
    text: String(body.text || ""),
    options: Array.isArray(body.options) ? body.options.map((v) => String(v)) : [],
    correct_index: Number(body.correctIndex ?? 0),
    time_limit_sec: Math.max(5, Number(body.timeLimitSec ?? 20)),
    order_index: Math.max(1, Number(body.order ?? 1)),
    is_active: body.isActive !== false,
  };
  const id = body.id ? String(body.id) : null;
  const testIdCandidates = await resolveTestIdCandidates(supabase);

  const minimal = { type: base.type, text: base.text, options: base.options, correct_index: base.correct_index };
  const legacy = {
    test_type: base.type,
    question: base.text,
    answers: base.options,
    correct_answer: base.correct_index,
    active: base.is_active,
    order: base.order_index,
  };
  const legacyTextAnswers = {
    ...legacy,
    answers: JSON.stringify(base.options),
  };
  const legacyCorrectText = {
    ...legacyTextAnswers,
    correct_answer: String(base.options[base.correct_index] ?? ""),
  };

  const attempts: Array<{ payload: Record<string, unknown>; updateKey: "id" | "question_id" }> = [
    { payload: base, updateKey: "id" },
    { payload: base, updateKey: "question_id" },
    { payload: minimal, updateKey: "id" },
    { payload: { question: base.text }, updateKey: "id" },
    { payload: { question: base.text }, updateKey: "question_id" },
    { payload: { text: base.text }, updateKey: "id" },
    { payload: legacy, updateKey: "question_id" },
    { payload: legacyTextAnswers, updateKey: "question_id" },
    { payload: legacyCorrectText, updateKey: "question_id" },
  ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    const payload = { ...attempt.payload };
    for (let retry = 0; retry < 12; retry += 1) {
      if (!Object.keys(payload).length) break;
      const normalizedPayload = Object.fromEntries(
        Object.entries(payload).filter(([, value]) => value !== null && value !== undefined),
      );
      const res = id
        ? await supabase.from("test_questions").update(normalizedPayload).eq(attempt.updateKey, id)
        : await supabase.from("test_questions").insert(normalizedPayload);
      if (!res.error) {
        const listed = await listQuestions();
        if (listed.error) return Response.json({ ok: true, saved: true, warning: listed.error });
        return Response.json({ ok: true, saved: true, questions: listed.data });
      }
      errors.push(res.error.message);
      if (
        !id &&
        res.error.message.toLowerCase().includes("null value in column \"test_id\"") &&
        !Object.prototype.hasOwnProperty.call(normalizedPayload, "test_id")
      ) {
        for (const candidate of testIdCandidates) {
          const withTestId = { ...normalizedPayload, test_id: candidate };
          const retryRes = await supabase.from("test_questions").insert(withTestId);
          if (!retryRes.error) {
            const listed = await listQuestions();
            if (listed.error) return Response.json({ ok: true, saved: true, warning: listed.error });
            return Response.json({ ok: true, saved: true, questions: listed.data });
          }
          errors.push(retryRes.error.message);
        }
      }
      const missingColumn = extractMissingColumn(res.error.message);
      if (!missingColumn) break;
      const removed = deleteKeyInsensitive(payload, missingColumn);
      if (!removed) break;
    }
  }

  return Response.json({ ok: false, error: errors[errors.length - 1] || "save_failed", details: errors }, { status: 400 });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string; isActive?: boolean };
  const id = String(body.id || "");
  if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
  const value = body.isActive !== false;
  const supabase = getServerSupabaseServiceClient();
  const attempts = [
    () => supabase.from("test_questions").update({ is_active: value }).eq("id", id),
    () => supabase.from("test_questions").update({ active: value }).eq("id", id),
    () => supabase.from("test_questions").update({ active: value }).eq("question_id", id),
    () => supabase.from("test_questions").update({ enabled: value }).eq("id", id),
  ];
  for (const attempt of attempts) {
    const res = await attempt();
    if (!res.error) {
      const listed = await listQuestions();
      return Response.json({ ok: true, questions: listed.data });
    }
  }
  return Response.json({ ok: false, error: "toggle_failed" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") || "");
  if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
  const supabase = getServerSupabaseServiceClient();
  const attempts = [
    () => supabase.from("test_questions").delete().eq("id", id),
    () => supabase.from("test_questions").delete().eq("question_id", id),
  ];
  for (const attempt of attempts) {
    const res = await attempt();
    if (!res.error) {
      const listed = await listQuestions();
      return Response.json({ ok: true, questions: listed.data });
    }
  }
  return Response.json({ ok: false, error: "delete_failed" }, { status: 400 });
}

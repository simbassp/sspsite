import { dedupeQuestionOptions } from "@/lib/answer-equivalence";
import { normalizeManualTopic } from "@/lib/manual-topic";
import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import type { TestQuestion } from "@/lib/types";

export const runtime = "nodejs";

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
    manual_topic: normalizeManualTopic(row.manual_topic ?? row.topic ?? row.bank_topic),
  };
}

function toClientTestQuestion(m: ReturnType<typeof mapQuestionRow>): TestQuestion {
  return dedupeQuestionOptions({
    id: m.id,
    type: m.type === "trial" ? "trial" : "final",
    text: m.text,
    options: m.options,
    correctIndex: m.correct_index,
    timeLimitSec: m.time_limit_sec,
    order: m.order_index,
    isActive: m.is_active,
    createdAt: m.created_at,
    manualTopic: m.manual_topic,
  });
}

async function listQuestions() {
  const supabase = getServerSupabaseServiceClient();
  const wildcard = await supabase.from("test_questions").select("*").limit(2000);
  if (wildcard.error) return { error: wildcard.error.message, data: [] as TestQuestion[] };
  const rows = (wildcard.data || []) as Array<Record<string, unknown>>;
  const mapped = rows
    .map(mapQuestionRow)
    .sort((a, b) => `${a.type}`.localeCompare(`${b.type}`) || a.order_index - b.order_index)
    .map(toClientTestQuestion);
  return { error: null as string | null, data: mapped };
}

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

  return candidates.filter(isUuid);
}

async function getQuestionColumns(supabase: ReturnType<typeof getServerSupabaseServiceClient>) {
  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name,is_nullable")
    .eq("table_schema", "public")
    .eq("table_name", "test_questions");
  if (error) return null;
  return (data || []) as Array<{ column_name: string; is_nullable: "YES" | "NO" | string }>;
}

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

function compactErrors(errors: string[]) {
  const unique: string[] = [];
  for (const err of errors) {
    if (!unique.includes(err)) unique.push(err);
  }
  return unique.slice(0, 10);
}

async function tryCreateTestRecord(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  tableName: "tests" | "test",
  type: "trial" | "final",
) {
  const id = crypto.randomUUID();
  const payload: Record<string, unknown> = {
    id,
    type,
    test_type: type,
    name: type === "trial" ? "Пробный тест" : "Итоговый тест",
    title: type === "trial" ? "Пробный тест" : "Итоговый тест",
    is_active: true,
    active: true,
  };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (!Object.keys(payload).length) break;
    const res = await supabase.from(tableName).insert(payload);
    if (!res.error) return id;
    const missingColumn = extractMissingColumn(res.error.message);
    if (missingColumn && deleteKeyInsensitive(payload, missingColumn)) continue;
    break;
  }
  return null;
}

async function resolveOrCreateTestId(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  type: "trial" | "final",
) {
  const existing = await resolveTestIdCandidates(supabase);
  if (existing.length) return existing[0];
  const createdInTests = await tryCreateTestRecord(supabase, "tests", type);
  if (createdInTests) return createdInTests;
  const createdInLegacy = await tryCreateTestRecord(supabase, "test", type);
  if (createdInLegacy) return createdInLegacy;
  return null;
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
    manualTopic?: string;
  };

  const supabase = getServerSupabaseServiceClient();
  const normalizedType: "trial" | "final" = body.type === "trial" ? "trial" : "final";
  const manualTopic = normalizeManualTopic(body.manualTopic);
  const base = {
    type: normalizedType,
    text: String(body.text || ""),
    options: Array.isArray(body.options) ? body.options.map((v) => String(v)) : [],
    correct_index: Number(body.correctIndex ?? 0),
    time_limit_sec: Math.max(5, Number(body.timeLimitSec ?? 20)),
    order_index: Math.max(1, Number(body.order ?? 1)),
    is_active: body.isActive !== false,
    manual_topic: manualTopic,
  };
  const id = body.id ? String(body.id) : null;
  const columns = await getQuestionColumns(supabase);
  const errors: string[] = [];
  const canIntrospect = Boolean(columns && columns.length);

  const columnSet = new Set((columns || []).map((c) => c.column_name.toLowerCase()));
  const nonNullable = new Set(
    (columns || [])
      .filter((c) => c.is_nullable === "NO")
      .map((c) => c.column_name.toLowerCase())
      .filter((name) => !["id", "created_at", "updated_at"].includes(name)),
  );

  const payload: Record<string, unknown> = {};
  const setIfExists = (column: string, value: unknown) => {
    if (!canIntrospect || columnSet.has(column)) payload[column] = value;
  };

  setIfExists("type", base.type);
  setIfExists("test_type", base.type);
  setIfExists("text", base.text);
  setIfExists("question", base.text);
  setIfExists("options", base.options);
  setIfExists("answers", base.options);
  setIfExists("correct_index", base.correct_index);
  setIfExists("correct_answer", base.correct_index);
  setIfExists("time_limit_sec", base.time_limit_sec);
  setIfExists("order_index", base.order_index);
  setIfExists("order", base.order_index);
  setIfExists("is_active", base.is_active);
  setIfExists("active", base.is_active);
  setIfExists("manual_topic", base.manual_topic);

  if (!canIntrospect || columnSet.has("test_id")) {
    const testId = await resolveOrCreateTestId(supabase, base.type);
    if (testId) {
      payload.test_id = testId;
    } else if (canIntrospect && nonNullable.has("test_id")) {
      return Response.json(
        { ok: false, error: "В БД test_questions.test_id обязателен, но не найдено ни одного валидного теста." },
        { status: 400 },
      );
    }
  }

  for (const required of nonNullable) {
    if (canIntrospect && !(required in payload)) {
      return Response.json(
        { ok: false, error: `В БД обязательна колонка "${required}", но API не знает как её заполнить.` },
        { status: 400 },
      );
    }
  }

  const updateByIdKey = canIntrospect ? (columnSet.has("id") ? "id" : columnSet.has("question_id") ? "question_id" : null) : "id";
  if (id && !updateByIdKey) {
    return Response.json({ ok: false, error: "В таблице нет ни id, ни question_id для обновления." }, { status: 400 });
  }

  let finalError: string | null = null;
  const updateKeys = canIntrospect ? [updateByIdKey as string] : ["id", "question_id"];
  for (const key of updateKeys) {
    const workingPayload = { ...payload };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (!Object.keys(workingPayload).length) break;
      const res = id
        ? await supabase.from("test_questions").update(workingPayload).eq(key, id)
        : await supabase.from("test_questions").insert(workingPayload);
      if (!res.error) {
        const listed = await listQuestions();
        if (listed.error) return Response.json({ ok: true, saved: true, warning: listed.error });
        return Response.json({ ok: true, saved: true, questions: listed.data });
      }
      finalError = res.error.message;
      errors.push(res.error.message);
      const missingColumn = extractMissingColumn(res.error.message);
      if (missingColumn && deleteKeyInsensitive(workingPayload, missingColumn)) {
        continue;
      }
      if (
        !id &&
        res.error.message.toLowerCase().includes("null value in column \"test_id\"") &&
        !Object.prototype.hasOwnProperty.call(workingPayload, "test_id")
      ) {
        const testId = await resolveOrCreateTestId(supabase, base.type);
        if (testId) {
          workingPayload.test_id = testId;
          continue;
        }
      }
      break;
    }
  }

  return Response.json({ ok: false, error: finalError || "save_failed", details: compactErrors(errors) }, { status: 400 });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session || !canManageTests(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json()) as { id?: string; isActive?: boolean; applyToAll?: boolean; timeLimitSec?: number };
  const applyToAll = body.applyToAll === true;
  const supabase = getServerSupabaseServiceClient();
  if (applyToAll) {
    const timeLimitSec = Math.max(5, Number(body.timeLimitSec ?? 20));
    const bulkAttempts = [
      () => supabase.from("test_questions").update({ time_limit_sec: timeLimitSec }).neq("id", ""),
      () => supabase.from("test_questions").update({ time_limit_sec: timeLimitSec }).neq("question_id", ""),
      () => supabase.from("test_questions").update({ time_sec: timeLimitSec }).neq("id", ""),
      () => supabase.from("test_questions").update({ time_limit: timeLimitSec }).neq("id", ""),
    ];
    for (const attempt of bulkAttempts) {
      const res = await attempt();
      if (!res.error) {
        const listed = await listQuestions();
        return Response.json({ ok: true, questions: listed.data });
      }
    }
    return Response.json({ ok: false, error: "bulk_time_update_failed" }, { status: 400 });
  }

  const id = String(body.id || "");
  if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });
  const value = body.isActive !== false;
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

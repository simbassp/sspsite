import {
  evaluateFinalTestClosure,
  type FinalTestClosureSettings,
  type FinalTestClosureStatus,
} from "@/lib/final-test-closure";
import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

const CLOSURE_SELECT = "final_test_closed_from,final_test_closed_until,final_test_closure_message";

export function mapClosureRow(row: Record<string, unknown> | null | undefined): FinalTestClosureSettings {
  return {
    closedFrom: row?.final_test_closed_from ? String(row.final_test_closed_from) : null,
    closedUntil: row?.final_test_closed_until ? String(row.final_test_closed_until) : null,
    message: row?.final_test_closure_message ? String(row.final_test_closure_message) : null,
  };
}

export async function loadFinalTestClosureSettings(
  supabase: SupabaseClient,
): Promise<FinalTestClosureSettings> {
  let res = await supabase.from("test_settings").select(CLOSURE_SELECT).eq("id", 1).maybeSingle();
  if (res.error && isMissingColumnError(res.error.message)) {
    return { closedFrom: null, closedUntil: null, message: null };
  }
  if (res.error || !res.data) {
    res = await supabase.from("test_settings").select(CLOSURE_SELECT).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  }
  if (res.error && isMissingColumnError(res.error.message)) {
    return { closedFrom: null, closedUntil: null, message: null };
  }
  return mapClosureRow((res.data || null) as Record<string, unknown> | null);
}

export async function loadFinalTestClosureStatus(
  supabase: SupabaseClient,
  now = Date.now(),
): Promise<FinalTestClosureStatus> {
  const settings = await loadFinalTestClosureSettings(supabase);
  return evaluateFinalTestClosure(settings, now);
}

export async function saveFinalTestClosureSettings(
  supabase: SupabaseClient,
  settings: FinalTestClosureSettings,
): Promise<{ ok: true; settings: FinalTestClosureSettings } | { ok: false; error: string }> {
  const payload = {
    id: 1,
    final_test_closed_from: settings.closedFrom,
    final_test_closed_until: settings.closedUntil,
    final_test_closure_message: settings.message,
    updated_at: new Date().toISOString(),
  };
  const res = await supabase.from("test_settings").upsert(payload, { onConflict: "id" }).select(CLOSURE_SELECT).maybeSingle();
  if (res.error) {
    if (isMissingColumnError(res.error.message)) {
      return { ok: false, error: "closure_columns_missing" };
    }
    return { ok: false, error: res.error.message };
  }
  return { ok: true, settings: mapClosureRow((res.data || payload) as Record<string, unknown>) };
}

export type FinalTestSummaryLike = {
  maxAttempts: number;
  usedAttempts: number;
  hasPassedFinal: boolean;
  canStartFinal: boolean;
  attemptsExhausted: boolean;
  nextAutoResetAt?: string;
};

export function applyFinalTestClosureToSummary<T extends FinalTestSummaryLike>(
  summary: T,
  closure: FinalTestClosureStatus,
) {
  const finalTestClosed = closure.isClosed;
  return {
    ...summary,
    canStartFinal: summary.canStartFinal && !finalTestClosed,
    finalTestClosed,
    finalTestClosureScheduled: closure.isScheduled,
    finalTestClosedFrom: closure.closedFrom,
    finalTestClosedUntil: closure.closedUntil,
    finalTestClosureMessage: closure.message,
  };
}

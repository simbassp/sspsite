import { applyFinalTestClosureToSummary, loadFinalTestClosureStatus } from "@/lib/final-test-closure-server";
import { computeFinalTestSummary } from "@/lib/server-final-test-summary";
import {
  evaluateOrphanAttempt,
  prepareOrphanForRecovery,
} from "@/lib/final-attempt-server";
import { loadTestsHistoryRows } from "@/lib/tests-history-server";
import { DEFAULT_TEST_CONFIG, normalizeTestConfig } from "@/lib/test-config";
import type { OrphanAttemptSummary } from "@/lib/types";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type ConfigRow = {
  trial_question_count: number;
  final_question_count: number;
  time_per_question_sec: number | null;
  uav_auto_generation: boolean | null;
  manual_bank_uav_ttx_enabled?: boolean | null;
  manual_bank_counteraction_enabled?: boolean | null;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

const EMPTY_ORPHAN: OrphanAttemptSummary = {
  hasOrphan: false,
  canRecover: false,
  recoveryUsed: false,
  expired: false,
  secondsRemaining: 0,
  questionIndex: 0,
  questionCount: 0,
  answeredCount: 0,
};

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 8_000 });
    const t0 = Date.now();
    const finalSummaryPromise = computeFinalTestSummary(supabase, session.id).catch(() => null);
    const closurePromise = loadFinalTestClosureStatus(supabase);
    const historyPromise = loadTestsHistoryRows(supabase, session.id).catch(() => ({
      ok: false as const,
      error: "history_failed",
      rows: [],
    }));

    let configQ = await supabase
      .from("test_settings")
      .select(
        "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
      )
      .eq("id", 1)
      .maybeSingle();
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .eq("id", 1)
        .maybeSingle();
    }
    const t1 = Date.now();

    const [finalTestSummaryRaw, closureStatus, historyResult] = await Promise.all([
      finalSummaryPromise,
      closurePromise,
      historyPromise,
    ]);
    const finalTestSummary = finalTestSummaryRaw
      ? applyFinalTestClosureToSummary(finalTestSummaryRaw, closureStatus)
      : null;
    const orphanRow = await prepareOrphanForRecovery(supabase, session.id).catch(() => null);
    const orphanAttempt: OrphanAttemptSummary = orphanRow
      ? evaluateOrphanAttempt(orphanRow)
      : EMPTY_ORPHAN;
    const t2 = Date.now();

    const cfg = (configQ.data || {}) as Partial<ConfigRow>;
    const config = normalizeTestConfig({
      trialQuestionCount: Number(cfg.trial_question_count ?? DEFAULT_TEST_CONFIG.trialQuestionCount),
      finalQuestionCount: Number(cfg.final_question_count ?? DEFAULT_TEST_CONFIG.finalQuestionCount),
      timePerQuestionSec: Number(cfg.time_per_question_sec ?? DEFAULT_TEST_CONFIG.timePerQuestionSec),
      uavAutoGeneration: cfg.uav_auto_generation !== false,
      manualBankUavTtxEnabled: cfg.manual_bank_uav_ttx_enabled !== false,
      manualBankCounteractionEnabled: cfg.manual_bank_counteraction_enabled !== false,
    });

    return Response.json({
      ok: true,
      config,
      hasOrphanAttempt: orphanAttempt.hasOrphan,
      orphanAttempt,
      bankQuestionTimeSec: config.timePerQuestionSec,
      timingsMs: {
        testSettings: t1 - t0,
        orphanAttempt: t2 - t1,
        total: Date.now() - t0,
      },
      finalTest: finalTestSummary,
      historyRows: historyResult.ok ? historyResult.rows : [],
      historyError: historyResult.ok ? null : historyResult.error,
      degraded: Boolean(configQ.error),
    });
  } catch {
    return Response.json({
      ok: true,
      config: DEFAULT_TEST_CONFIG,
      hasOrphanAttempt: false,
      orphanAttempt: EMPTY_ORPHAN,
      bankQuestionTimeSec: DEFAULT_TEST_CONFIG.timePerQuestionSec,
      finalTest: null,
      historyRows: [],
      historyError: "bootstrap_timeout",
      degraded: true,
    });
  }
}

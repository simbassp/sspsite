import { applyFinalTestClosureToSummary, loadFinalTestClosureStatus } from "@/lib/final-test-closure-server";
import { computeFinalTestSummary } from "@/lib/server-final-test-summary";
import {
  evaluateOrphanAttempt,
  prepareOrphanForRecovery,
} from "@/lib/final-attempt-server";
import { loadTestsHistoryRows } from "@/lib/tests-history-server";
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

function resolveBankQuestionTimeSec(rows: Array<{ time_limit_sec?: unknown }>) {
  if (!rows.length) return null;
  const freq = new Map<number, number>();
  for (const row of rows) {
    const sec = Math.max(5, Number(row.time_limit_sec ?? 10));
    const normalized = Number.isFinite(sec) ? sec : 10;
    freq.set(normalized, (freq.get(normalized) || 0) + 1);
  }
  let winner = 10;
  let count = -1;
  for (const [sec, c] of freq.entries()) {
    if (c > count) {
      winner = sec;
      count = c;
    }
  }
  return winner;
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 12_000 });
    const t0 = Date.now();
    const bankTimePromise = supabase
      .from("test_questions")
      .select("time_limit_sec")
      .eq("is_active", true)
      .limit(2000);
    const finalSummaryPromise = computeFinalTestSummary(supabase, session.id).catch(() => null);
    const closurePromise = loadFinalTestClosureStatus(supabase);
    const historyPromise = loadTestsHistoryRows(supabase, session.id).catch(() => ({ ok: false as const, error: "history_failed", rows: [] }));

    let configQ = await supabase
      .from("test_settings")
      .select(
        "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((configQ.error || !configQ.data) && isMissingColumnError(configQ.error?.message)) {
      configQ = await supabase
        .from("test_settings")
        .select(
          "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error || !configQ.data) {
      configQ = await supabase
        .from("test_settings")
        .select(
          "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
        )
        .eq("id", 1)
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation")
        .eq("id", 1)
        .limit(1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,time_per_question_sec")
        .eq("id", 1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count,uav_auto_generation")
        .eq("id", 1)
        .maybeSingle();
    }
    if (configQ.error && isMissingColumnError(configQ.error.message)) {
      configQ = await supabase
        .from("test_settings")
        .select("trial_question_count,final_question_count")
        .eq("id", 1)
        .maybeSingle();
    }
    if (!configQ.error && !configQ.data) {
      configQ = await supabase
        .from("test_settings")
        .select(
          "trial_question_count,final_question_count,time_per_question_sec,uav_auto_generation,manual_bank_uav_ttx_enabled,manual_bank_counteraction_enabled",
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    const t1 = Date.now();

    const [bankTimeQ, finalTestSummaryRaw, closureStatus, historyResult] = await Promise.all([
      bankTimePromise,
      finalSummaryPromise,
      closurePromise,
      historyPromise,
    ]);
    const finalTestSummary = finalTestSummaryRaw
      ? applyFinalTestClosureToSummary(finalTestSummaryRaw, closureStatus)
      : null;
    const orphanRow = await prepareOrphanForRecovery(supabase, session.id);
    const orphanAttempt: OrphanAttemptSummary = evaluateOrphanAttempt(orphanRow);
    const t2 = Date.now();
    if (configQ.error) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/tests/bootstrap] config error", configQ.error.message);
      }
      return Response.json(
        {
          ok: false,
          error: configQ.error?.message || "bootstrap_failed",
        },
        { status: 500 },
      );
    }

    const t3 = Date.now();

    const cfg = (configQ.data || {}) as Partial<ConfigRow>;
    const bankQuestionTimeSec = !bankTimeQ.error
      ? resolveBankQuestionTimeSec((bankTimeQ.data as Array<{ time_limit_sec?: unknown }>) || [])
      : null;
    if (process.env.NODE_ENV !== "production") {
      console.debug("[api/tests/bootstrap] ok", {
        userId: session.id,
        hasSettings: Boolean(configQ.data),
        hasOrphanAttempt: orphanAttempt.hasOrphan,
        orphanAttempt,
        timingsMs: {
          testSettings: t1 - t0,
          orphanAttempt: t2 - t1,
          finalSummaryMs: t3 - t2,
          total: t3 - t0,
        },
      });
    }

    return Response.json({
      ok: true,
      config: {
        trialQuestionCount: Number(cfg.trial_question_count ?? 10),
        finalQuestionCount: Number(cfg.final_question_count ?? 15),
        timePerQuestionSec: Number(cfg.time_per_question_sec ?? 10),
        uavAutoGeneration: Boolean(cfg.uav_auto_generation ?? true),
        manualBankUavTtxEnabled: cfg.manual_bank_uav_ttx_enabled !== false,
        manualBankCounteractionEnabled: cfg.manual_bank_counteraction_enabled !== false,
      },
      hasOrphanAttempt: orphanAttempt.hasOrphan,
      orphanAttempt,
      bankQuestionTimeSec,
      timingsMs: {
        testSettings: t1 - t0,
        orphanAttempt: t2 - t1,
        finalSummaryMs: t3 - t2,
        total: t3 - t0,
      },
      finalTest: finalTestSummary,
      historyRows: historyResult.ok ? historyResult.rows : [],
      historyError: historyResult.ok ? null : historyResult.error,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "bootstrap_exception" },
      { status: 500 },
    );
  }
}

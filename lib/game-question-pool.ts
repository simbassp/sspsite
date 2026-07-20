import { filterDbPoolByManualTopicSettings } from "@/lib/manual-topic";
import { normalizeTestConfig } from "@/lib/test-config";
import { fetchActiveQuestionPool, fetchTestConfig } from "@/lib/tests-repository";
import type { TestQuestion } from "@/lib/types";

async function loadDbQuestionBank(): Promise<TestQuestion[]> {
  try {
    const response = await fetch("/api/tests/pool", { cache: "no-store" });
    const payload = (await response.json()) as {
      ok?: boolean;
      questionPool?: TestQuestion[];
    };
    if (response.ok && payload.ok && Array.isArray(payload.questionPool)) {
      return payload.questionPool;
    }
  } catch {
    /* fallback below */
  }
  return fetchActiveQuestionPool();
}

/** Активные вопросы только из банка тестов (без автогенерации из карточек БПЛА). */
export async function loadGameQuestionPool(): Promise<TestQuestion[]> {
  try {
    const [dbPool, configRaw] = await Promise.all([loadDbQuestionBank(), fetchTestConfig()]);
    const config = normalizeTestConfig(configRaw);
    return filterDbPoolByManualTopicSettings(
      dbPool.filter((q) => q.isActive !== false),
      config,
    );
  } catch {
    return [];
  }
}

import { filterDbPoolByManualTopicSettings } from "@/lib/manual-topic";
import { normalizeTestConfig } from "@/lib/test-config";
import type { TestConfig, TestQuestion } from "@/lib/types";
import { generateUavTtxQuestionBank } from "@/lib/uav-test-generator";

const DEFAULT_CONFIG: TestConfig = {
  trialQuestionCount: 10,
  finalQuestionCount: 15,
  timePerQuestionSec: 10,
  uavAutoGeneration: true,
  manualBankUavTtxEnabled: true,
  manualBankCounteractionEnabled: true,
};

function mergePool(dbPool: TestQuestion[], uavItems: unknown[], config: TestConfig) {
  const dbFiltered = filterDbPoolByManualTopicSettings(dbPool, config);
  if (!config.uavAutoGeneration) return dbFiltered;
  const fromUav = generateUavTtxQuestionBank(uavItems as never[], config.timePerQuestionSec);
  if (!fromUav.length) return dbFiltered;
  const ids = new Set(fromUav.map((q) => q.id));
  return [...fromUav, ...dbFiltered.filter((q) => !ids.has(q.id))];
}

export async function loadGameQuestionPool(): Promise<TestQuestion[]> {
  try {
    const response = await fetch("/api/tests/pool", { cache: "no-store" });
    const payload = (await response.json()) as {
      ok?: boolean;
      questionPool?: TestQuestion[];
      uavItems?: unknown[];
    };
    if (!response.ok || !payload.ok) return [];
    const dbPool = Array.isArray(payload.questionPool) ? payload.questionPool : [];
    const uavItems = Array.isArray(payload.uavItems) ? payload.uavItems : [];
    return mergePool(dbPool, uavItems, DEFAULT_CONFIG);
  } catch {
    return [];
  }
}

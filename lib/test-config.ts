import type { TestConfig } from "@/lib/types";

export const DEFAULT_TEST_CONFIG: TestConfig = {
  trialQuestionCount: 10,
  finalQuestionCount: 15,
  timePerQuestionSec: 10,
  uavAutoGeneration: true,
};

export function normalizeTestConfig(raw: Partial<TestConfig> | null | undefined): TestConfig {
  const d = DEFAULT_TEST_CONFIG;
  const uav =
    typeof raw?.uavAutoGeneration === "boolean" ? raw.uavAutoGeneration : d.uavAutoGeneration;
  return {
    trialQuestionCount: Math.max(1, Math.floor(Number(raw?.trialQuestionCount) || d.trialQuestionCount)),
    finalQuestionCount: Math.max(1, Math.floor(Number(raw?.finalQuestionCount) || d.finalQuestionCount)),
    timePerQuestionSec: Math.max(5, Math.floor(Number(raw?.timePerQuestionSec) || d.timePerQuestionSec)),
    uavAutoGeneration: uav,
  };
}

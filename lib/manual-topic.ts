import type { ManualQuestionTopic, TestConfig, TestQuestion } from "@/lib/types";

export function normalizeManualTopic(raw: unknown): ManualQuestionTopic {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "counteraction" || s === "противодействие" || s === "protivodeystvie") {
    return "counteraction";
  }
  return "uav_ttx";
}

export function effectiveManualTopic(q: TestQuestion): ManualQuestionTopic {
  return q.manualTopic ?? "uav_ttx";
}

/** Фильтрует вопросы из БД по включённым темам ручного банка (ТТХ БПЛА / противодействие). */
export function filterDbPoolByManualTopicSettings(
  questions: TestQuestion[],
  config: Pick<TestConfig, "manualBankUavTtxEnabled" | "manualBankCounteractionEnabled">,
): TestQuestion[] {
  return questions.filter((q) => {
    const t = effectiveManualTopic(q);
    if (t === "uav_ttx" && !config.manualBankUavTtxEnabled) return false;
    if (t === "counteraction" && !config.manualBankCounteractionEnabled) return false;
    return true;
  });
}

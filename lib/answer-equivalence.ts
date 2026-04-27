import type { TestQuestion } from "@/lib/types";

export function normalizeUnitToken(unit: string) {
  return unit.replace(/\s+/g, "").toLowerCase();
}

/** Совместимо с генератором вопросов по ТТХ БПЛА (`uav-test-generator`). */
export function parseValueParts(s: string): { num: number | null; unit: string; isNumeric: boolean } {
  const t = s.trim().replace(/\s+/g, " ");
  const m = t.match(/^(-?[\d]+[.,\d]*)\s*(.*)$/u);
  if (m && m[1]) {
    const num = parseFloat(m[1].replace(",", "."));
    const rest = (m[2] ?? "").trim();
    if (Number.isFinite(num)) {
      return { num, unit: rest.toLowerCase(), isNumeric: true };
    }
  }
  return { num: null, unit: t.toLowerCase(), isNumeric: false };
}

/**
 * Ключ эквивалентности вариантов: «2.5» и «2,5», «2.5 м» и «2,5 м» совпадают.
 * Для нечисловых строк — нормализованный текст.
 */
export function answerEquivalenceKey(raw: string): string {
  const p = parseValueParts(raw.trim().replace(/\s+/g, " "));
  if (p.isNumeric && p.num !== null) {
    return `n:${p.num}:${normalizeUnitToken(p.unit)}`;
  }
  const t = raw.trim().replace(/\s+/g, " ").toLowerCase();
  return `t:${t}`;
}

/** Убирает дубликаты по смыслу, пересчитывает индекс верного ответа. */
export function dedupeQuestionOptions(q: TestQuestion): TestQuestion {
  const { options, correctIndex } = q;
  if (!options.length) return q;

  const correctText = options[correctIndex] ?? options[0] ?? "";
  const correctKey = answerEquivalenceKey(correctText);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const opt of options) {
    const k = answerEquivalenceKey(opt);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(opt);
  }

  let newCorrectIndex = out.findIndex((o) => answerEquivalenceKey(o) === correctKey);
  if (newCorrectIndex < 0) newCorrectIndex = 0;

  return { ...q, options: out, correctIndex: newCorrectIndex };
}

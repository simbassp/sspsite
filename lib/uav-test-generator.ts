import { CatalogItem, TestQuestion, TestType } from "@/lib/types";

const DEFAULT_TYPE: TestType = "trial";

const FALLBACK_DISTRACTORS = [
  "В справочнике БПЛА не указано",
  "Значение относится к другому классу ВС",
  "Сведения из другого источника (не ТТХ)",
];

function normKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUnitToken(unit: string) {
  return unit.replace(/\s+/g, "").toLowerCase();
}

/** Число и хвост строки (единица измерения или текст без ведущего числа). */
function parseValueParts(s: string): { num: number | null; unit: string; isNumeric: boolean } {
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

/** Неверные ответы только из той же «размерности», что и правильный (те же единицы или оба текста без чисел). */
function sameMeasurementClass(correct: string, candidate: string): boolean {
  const a = parseValueParts(correct);
  const b = parseValueParts(candidate);
  const digitA = /\d/.test(correct);
  const digitB = /\d/.test(candidate);
  if (digitA !== digitB) return false;

  if (a.isNumeric && b.isNumeric) {
    const ua = normalizeUnitToken(a.unit);
    const ub = normalizeUnitToken(b.unit);
    if (!ua && !ub) return true;
    return ua === ub && ua.length > 0;
  }

  if (!a.isNumeric && !b.isNumeric) {
    return a.unit !== b.unit;
  }
  return false;
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function formatNumberForWrong(correct: string, n: number): string {
  const prefersComma = correct.includes(",") && !correct.includes(".");
  const rounded = Math.abs(n) >= 100 ? Math.round(n / 5) * 5 : Math.abs(n) >= 20 ? Math.round(n) : Math.round(n * 10) / 10;
  let s = Number.isInteger(rounded) && !prefersComma ? String(rounded) : String(rounded).replace(".", ",");
  if (prefersComma && s.includes(".")) s = s.replace(".", ",");
  return s;
}

/** Похожие числовые значения с той же единицей, что у правильного ответа. */
function syntheticNumericWrongs(correct: string, need: number, seen: Set<string>): string[] {
  const p = parseValueParts(correct);
  if (!p.isNumeric || p.num === null) return [];
  const unitPart = correct.trim().replace(/^-?[\d]+[.,\d]*\s*/u, "").trim();
  if (!unitPart) return [];

  const n = p.num;
  const factors = [0.82, 1.18, 0.91, 1.09, 0.75, 1.25, 0.95, 1.05];
  const out: string[] = [];

  for (const f of factors) {
    let cand = n * f;
    if (Math.abs(cand - n) < 1e-9) continue;
    if (Math.abs(n) >= 200) cand = Math.round(cand / 10) * 10;
    else if (Math.abs(n) >= 50) cand = Math.round(cand / 5) * 5;
    else if (Math.abs(n) >= 10) cand = Math.round(cand);
    else cand = Math.round(cand * 10) / 10;
    if (Math.abs(cand - n) < 1e-6) continue;

    const numStr = formatNumberForWrong(correct, cand);
    const formatted = `${numStr} ${unitPart}`.trim();
    const lk = formatted.toLowerCase();
    if (seen.has(lk)) continue;
    if (!sameMeasurementClass(correct, formatted)) continue;
    seen.add(lk);
    out.push(formatted);
    if (out.length >= need) break;
  }
  return out;
}

function buildFourOptions(correct: string, wrongPool: string[]): { options: string[]; correctIndex: number } {
  const correctTrim = correct.trim();
  const seen = new Set<string>([correctTrim.toLowerCase()]);
  const wrongs: string[] = [];

  const filteredPool = wrongPool.filter((w) => sameMeasurementClass(correctTrim, w.trim()));

  for (const w of filteredPool) {
    const t = w.trim();
    if (!t) continue;
    const lk = t.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    wrongs.push(t);
    if (wrongs.length >= 12) break;
  }

  for (const syn of syntheticNumericWrongs(correctTrim, 12, seen)) {
    if (wrongs.length >= 12) break;
    wrongs.push(syn);
  }

  let padIdx = 0;
  while (wrongs.length < 3) {
    const base = FALLBACK_DISTRACTORS[padIdx % FALLBACK_DISTRACTORS.length]!;
    padIdx += 1;
    let t = padIdx > FALLBACK_DISTRACTORS.length ? `${base} (${padIdx})` : base;
    let guard = 0;
    while (seen.has(t.toLowerCase()) && guard < 50) {
      guard += 1;
      t = `${base} (${guard})`;
    }
    seen.add(t.toLowerCase());
    wrongs.push(t);
  }

  const options = [correctTrim, wrongs[0]!, wrongs[1]!, wrongs[2]!];
  shuffleInPlace(options);
  return { options, correctIndex: options.indexOf(correctTrim) };
}

function collectWrongValuePool(
  correctValue: string,
  keyNorm: string,
  currentItemId: string,
  items: CatalogItem[],
): string[] {
  const pool: string[] = [];

  for (const it of items) {
    if (it.id === currentItemId) continue;
    const spec = it.specs.find((s) => normKey(s.key) === keyNorm);
    const v = spec?.value?.trim();
    if (v) pool.push(v);
  }

  const current = items.find((it) => it.id === currentItemId);
  if (current) {
    for (const s of current.specs) {
      if (normKey(s.key) === keyNorm) continue;
      const v = s.value?.trim();
      if (v) pool.push(v);
    }
  }

  for (const it of items) {
    for (const s of it.specs) {
      if (normKey(s.key) === keyNorm) continue;
      const v = s.value?.trim();
      if (v) pool.push(v);
    }
  }

  shuffleInPlace(pool);
  return pool;
}

function stableQuestionId(itemId: string, specIndex: number, keyNorm: string) {
  const safeKey = keyNorm.replace(/[^a-zа-яё0-9]+/gi, "_").slice(0, 80);
  return `uav-q:${itemId}:${specIndex}:${safeKey}`;
}

/**
 * Банк вопросов по ТТХ из карточек БПЛА: для каждой пары (модель, параметр) — один MCQ, 4 варианта, 10 сек.
 * Неверные варианты подбираются в той же единице измерения, что и правильный ответ; при нехватке — близкие числа.
 */
export function generateUavTtxQuestionBank(items: CatalogItem[], timeLimitSec = 10): TestQuestion[] {
  const list = items.filter((it) => it.specs?.length);
  if (!list.length) return [];

  const lim = Math.max(5, Math.floor(Number(timeLimitSec) || 10));
  const out: TestQuestion[] = [];
  let order = 0;
  const createdAt = new Date().toISOString();

  for (const item of list) {
    item.specs.forEach((spec, specIndex) => {
      const key = spec.key?.trim();
      const value = spec.value?.trim();
      if (!key || !value) return;

      const keyNorm = normKey(key);
      const wrongPool = collectWrongValuePool(value, keyNorm, item.id, list);
      const { options, correctIndex } = buildFourOptions(value, wrongPool);

      order += 1;
      out.push({
        id: stableQuestionId(item.id, specIndex, keyNorm),
        type: DEFAULT_TYPE,
        text: `У БПЛА «${item.title}» в ТТХ указано значение параметра «${key}». Какое?`,
        options,
        correctIndex,
        timeLimitSec: lim,
        order,
        isActive: true,
        createdAt,
      });
    });
  }

  return out;
}

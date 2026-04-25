import { CatalogItem, TestQuestion, TestType } from "@/lib/types";

const DEFAULT_TYPE: TestType = "trial";

const LABEL_ENGINE_DVS = "ДВС";
const LABEL_ENGINE_ELEC = "электрический";

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

/** Допуск по отношению кандидата к правильному числу (чтобы не было «40 кг» против «1400 кг»). */
function numericRatioOk(correctNum: number, candNum: number, relaxed: boolean): boolean {
  if (!Number.isFinite(correctNum) || !Number.isFinite(candNum) || correctNum === 0) return false;
  const r = candNum / correctNum;
  const lo = relaxed ? 0.82 : Math.abs(correctNum) >= 800 ? 0.9 : Math.abs(correctNum) >= 200 ? 0.88 : 0.8;
  const hi = relaxed ? 1.18 : Math.abs(correctNum) >= 800 ? 1.1 : Math.abs(correctNum) >= 200 ? 1.12 : 1.22;
  return r >= lo && r <= hi;
}

function plausibleNumericNeighbor(correct: string, candidate: string, relaxed: boolean): boolean {
  const a = parseValueParts(correct);
  const b = parseValueParts(candidate);
  if (!a.isNumeric || !b.isNumeric || a.num === null || b.num === null) return true;
  if (!sameMeasurementClass(correct, candidate)) return false;
  return numericRatioOk(a.num, b.num, relaxed);
}

function isEngineSpecKey(keyNorm: string) {
  return keyNorm.includes("двигат");
}

/** Значение из карточки: двс / электрический / гибридный / не распознано. */
function parseEngineKind(raw: string): "двс" | "электрический" | "гибридный" | null {
  const v = raw.trim().toLowerCase();
  if (v.includes("гибрид")) return "гибридный";
  if (v.includes("электр")) return "электрический";
  if (v.includes("двс") || v.includes("дыс")) return "двс";
  return null;
}

/** Ровно два варианта ответа: ДВС и электрический. */
function buildEngineTwoOptions(kind: "двс" | "электрический"): { options: string[]; correctIndex: number } {
  const correctLabel = kind === "двс" ? LABEL_ENGINE_DVS : LABEL_ENGINE_ELEC;
  const options = [LABEL_ENGINE_DVS, LABEL_ENGINE_ELEC];
  shuffleInPlace(options);
  return { options, correctIndex: options.indexOf(correctLabel) };
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

/** Похожие числа в той же единице, в узком диапазоне от правильного значения. */
function syntheticNumericWrongs(
  correct: string,
  need: number,
  seen: Set<string>,
  relaxed: boolean,
): string[] {
  const p = parseValueParts(correct);
  if (!p.isNumeric || p.num === null) return [];
  const unitPart = correct.trim().replace(/^-?[\d]+[.,\d]*\s*/u, "").trim();
  if (!unitPart) return [];

  const n = p.num;
  const factors = relaxed
    ? [0.93, 1.07, 0.87, 1.13, 0.95, 1.05, 0.9, 1.1]
    : [0.96, 1.04, 0.93, 1.07, 0.91, 1.09, 0.94, 1.06, 0.98, 1.02];

  const out: string[] = [];

  for (const f of factors) {
    let cand = n * f;
    const step =
      Math.abs(n) >= 2000 ? 20 : Math.abs(n) >= 800 ? 10 : Math.abs(n) >= 200 ? 5 : Math.abs(n) >= 50 ? 2 : 1;
    cand = Math.round(cand / step) * step;
    if (Math.abs(cand - n) < 1e-6) continue;
    if (!numericRatioOk(n, cand, relaxed)) continue;

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

  const filteredPool = wrongPool.filter(
    (w) => sameMeasurementClass(correctTrim, w.trim()) && plausibleNumericNeighbor(correctTrim, w.trim(), false),
  );

  for (const w of filteredPool) {
    const t = w.trim();
    if (!t) continue;
    const lk = t.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    wrongs.push(t);
    if (wrongs.length >= 12) break;
  }

  for (const syn of syntheticNumericWrongs(correctTrim, 12, seen, false)) {
    if (wrongs.length >= 12) break;
    wrongs.push(syn);
  }

  if (wrongs.length < 3) {
    const relaxedPool = wrongPool.filter(
      (w) =>
        sameMeasurementClass(correctTrim, w.trim()) && plausibleNumericNeighbor(correctTrim, w.trim(), true),
    );
    for (const w of relaxedPool) {
      const t = w.trim();
      if (!t) continue;
      const lk = t.toLowerCase();
      if (seen.has(lk)) continue;
      seen.add(lk);
      wrongs.push(t);
      if (wrongs.length >= 12) break;
    }
  }

  for (const syn of syntheticNumericWrongs(correctTrim, 12, seen, true)) {
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
 * Банк вопросов по ТТХ из карточек БПЛА: MCQ; для типа двигателя — только ДВС / электрический (гибрид не спрашиваем).
 * Числовые неверные варианты близки по величине к правильному ответу (та же единица).
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

      let options: string[];
      let correctIndex: number;
      let text: string;

      if (isEngineSpecKey(keyNorm)) {
        const engineKind = parseEngineKind(value);
        if (engineKind !== "двс" && engineKind !== "электрический") return;
        const two = buildEngineTwoOptions(engineKind);
        options = two.options;
        correctIndex = two.correctIndex;
        text = `Какой тип двигателя стоит у БПЛА «${item.title}»?`;
      } else {
        const wrongPool = collectWrongValuePool(value, keyNorm, item.id, list);
        ({ options, correctIndex } = buildFourOptions(value, wrongPool));
        text = `У БПЛА «${item.title}» в ТТХ указано значение параметра «${key}». Какое?`;
      }

      order += 1;
      out.push({
        id: stableQuestionId(item.id, specIndex, keyNorm),
        type: DEFAULT_TYPE,
        text,
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

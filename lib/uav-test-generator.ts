import { CatalogItem, TestQuestion, TestType } from "@/lib/types";

const TIME_PER_QUESTION_SEC = 10;
const DEFAULT_TYPE: TestType = "trial";

const FALLBACK_DISTRACTORS = [
  "В справочнике БПЛА не указано",
  "Значение относится к другому классу ВС",
  "Сведения из другого источника (не ТТХ)",
];

function normKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, " ");
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildFourOptions(correct: string, wrongPool: string[]): { options: string[]; correctIndex: number } {
  const correctTrim = correct.trim();
  const seen = new Set<string>([correctTrim.toLowerCase()]);
  const wrongs: string[] = [];

  for (const w of wrongPool) {
    const t = w.trim();
    if (!t) continue;
    const lk = t.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    wrongs.push(t);
    if (wrongs.length >= 12) break;
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
 */
export function generateUavTtxQuestionBank(items: CatalogItem[]): TestQuestion[] {
  const list = items.filter((it) => it.specs?.length);
  if (!list.length) return [];

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
        timeLimitSec: TIME_PER_QUESTION_SEC,
        order,
        isActive: true,
        createdAt,
      });
    });
  }

  return out;
}

/** Базовые категории больше не зашиты — список ведётся через пресеты / «Другое». */
export const COUNTERACTION_BUILTIN_CATEGORIES = [] as const;

export type CounteractionBuiltinCategory = string;

export function normalizeCounteractionCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export function isBuiltinCounteractionCategory(_value: string): boolean {
  return false;
}

export function findCanonicalCounteractionCategory(value: string, pool: readonly string[]): string | null {
  const n = normalizeCounteractionCategoryLabel(value);
  if (!n) return null;
  return pool.find((c) => normalizeCounteractionCategoryLabel(c) === n) ?? null;
}

export function mergeCounteractionCategoryLists(...lists: Array<readonly string[] | string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeCounteractionCategoryLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

export function buildCounteractionCategoryOptions(custom: readonly string[] = []): string[] {
  return mergeCounteractionCategoryLists(custom);
}

export function itemMatchesCounteractionCategory(categoryField: string, selected: string): boolean {
  const selectedNorm = normalizeCounteractionCategoryLabel(selected);
  if (!selectedNorm) return true;

  const parts = categoryField
    .split(/\s*[/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [categoryField.trim()].filter(Boolean);

  return candidates.some((label) => normalizeCounteractionCategoryLabel(label) === selectedNorm);
}

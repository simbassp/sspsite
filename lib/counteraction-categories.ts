/** Базовые категории противодействия (нельзя удалить). */
export const COUNTERACTION_BUILTIN_CATEGORIES = [
  "Оружие",
  "Подавление",
  "РЭБ",
  "Маскировка",
  "Укрытие",
  "Инженерные",
  "Медицина",
  "Оповещение",
  "Действия группы",
] as const;

export type CounteractionBuiltinCategory = (typeof COUNTERACTION_BUILTIN_CATEGORIES)[number];

export function normalizeCounteractionCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export function isBuiltinCounteractionCategory(value: string): boolean {
  const n = normalizeCounteractionCategoryLabel(value);
  return COUNTERACTION_BUILTIN_CATEGORIES.some((c) => normalizeCounteractionCategoryLabel(c) === n);
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
  return mergeCounteractionCategoryLists(COUNTERACTION_BUILTIN_CATEGORIES, custom);
}

export function itemMatchesCounteractionCategory(categoryField: string, selected: string): boolean {
  const selectedNorm = normalizeCounteractionCategoryLabel(selected);
  if (!selectedNorm) return true;

  const parts = categoryField
    .split(/\s*[/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [categoryField.trim()].filter(Boolean);

  return candidates.some((label) => {
    const n = normalizeCounteractionCategoryLabel(label);
    if (n === selectedNorm) return true;
    if (selectedNorm === "реб" && (n.includes("рэб") || n.includes("реб") || n.includes("радиоэлектрон"))) return true;
    if (selectedNorm.startsWith("подавлен") && n.includes("подавлен")) return true;
    if (selectedNorm.startsWith("медицин") && (n.includes("медицин") || n.includes("помощ"))) return true;
    if (selectedNorm.startsWith("инженерн") && n.includes("инженерн")) return true;
    if (selectedNorm.startsWith("действия") && (n.includes("действи") || n.includes("атак"))) return true;
    return false;
  });
}

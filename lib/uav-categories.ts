/** Базовые категории БПЛА (нельзя удалить). */
export const UAV_BUILTIN_CATEGORIES = [
  "Ударные ДВС",
  "Ударные Эл.",
  "Разведывательные",
  "Мультикоптер",
  "Крыло",
  "Реактивные БПЛА",
] as const;

/** @deprecated используйте UAV_BUILTIN_CATEGORIES */
export const UAV_CATEGORIES = UAV_BUILTIN_CATEGORIES;

export type UavBuiltinCategory = (typeof UAV_BUILTIN_CATEGORIES)[number];
export type UavCategory = string;

export function normalizeUavCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export function isBuiltinUavCategory(value: string): boolean {
  const n = normalizeUavCategoryLabel(value);
  return UAV_BUILTIN_CATEGORIES.some((c) => normalizeUavCategoryLabel(c) === n);
}

/** @deprecated — алиас isBuiltinUavCategory */
export function isPresetUavCategory(value: string): boolean {
  return isBuiltinUavCategory(value);
}

export function findCanonicalUavCategory(value: string, pool: readonly string[]): string | null {
  const n = normalizeUavCategoryLabel(value);
  if (!n) return null;
  return pool.find((c) => normalizeUavCategoryLabel(c) === n) ?? null;
}

export function mergeUavCategoryLists(...lists: Array<readonly string[] | string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeUavCategoryLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

/** Базовые + пользовательские, базовые всегда первыми. */
export function buildUavCategoryOptions(custom: readonly string[] = []): string[] {
  return mergeUavCategoryLists(UAV_BUILTIN_CATEGORIES, custom);
}

/** Совпадение карточки с выбранной категорией (учитывает старые названия). */
export function itemMatchesUavCategory(categoryField: string, selected: string): boolean {
  const selectedNorm = normalizeUavCategoryLabel(selected);
  if (!selectedNorm) return true;

  const parts = categoryField
    .split(/\s*[/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [categoryField.trim()].filter(Boolean);

  return candidates.some((label) => {
    const n = normalizeUavCategoryLabel(label);
    if (n === selectedNorm) return true;

    if (selectedNorm.startsWith("ударные двс") && (n === "ударный" || (n.includes("ударн") && n.includes("двс")))) {
      return true;
    }
    if (
      selectedNorm.startsWith("ударные эл") &&
      n.includes("ударн") &&
      (n.includes("эл") || n.includes("электр") || n.includes("fpv"))
    ) {
      return true;
    }
    if (selectedNorm.startsWith("разведывательн") && (n.startsWith("разведывательн") || n.includes("развед"))) {
      return true;
    }
    if (selectedNorm.startsWith("мультикоптер") && n.includes("мультикоптер")) return true;
    if (selectedNorm === "крыло" && n.includes("крыло")) return true;
    if (selectedNorm.startsWith("реактивн") && n.includes("реактивн")) return true;
    return false;
  });
}

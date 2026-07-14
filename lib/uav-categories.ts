/** Категории карточек БПЛА (админка и фильтр на странице ТТХ). */
export const UAV_CATEGORIES = [
  "Ударные ДВС",
  "Ударные Эл.",
  "Разведывательные",
  "Мультикоптер",
  "Крыло",
] as const;

export type UavCategory = (typeof UAV_CATEGORIES)[number];

export function normalizeUavCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
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

    // Совместимость со старыми значениями «Ударный» / «Разведывательный»
    if (selectedNorm.startsWith("ударные двс") && (n === "ударный" || n.includes("ударн") && n.includes("двс"))) {
      return true;
    }
    if (
      selectedNorm.startsWith("ударные эл") &&
      (n.includes("ударн") && (n.includes("эл") || n.includes("электр") || n.includes("fpv")))
    ) {
      return true;
    }
    if (selectedNorm.startsWith("разведывательн") && (n.startsWith("разведывательн") || n.includes("развед"))) {
      return true;
    }
    if (selectedNorm.startsWith("мультикоптер") && n.includes("мультикоптер")) return true;
    if (selectedNorm === "крыло" && (n === "крыло" || n.includes("крыло"))) return true;
    return false;
  });
}

export function isPresetUavCategory(value: string): value is UavCategory {
  const n = normalizeUavCategoryLabel(value);
  return UAV_CATEGORIES.some((c) => normalizeUavCategoryLabel(c) === n);
}

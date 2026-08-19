export const TACTICAL_MEDICINE_BUILTIN_CATEGORIES = [] as const;

export function normalizeTacticalMedicineCategoryLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export function isBuiltinTacticalMedicineCategory(_value: string): boolean {
  return false;
}

export function findCanonicalTacticalMedicineCategory(value: string, pool: readonly string[]): string | null {
  const n = normalizeTacticalMedicineCategoryLabel(value);
  if (!n) return null;
  return pool.find((c) => normalizeTacticalMedicineCategoryLabel(c) === n) ?? null;
}

export function mergeTacticalMedicineCategoryLists(...lists: Array<readonly string[] | string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeTacticalMedicineCategoryLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

export function buildTacticalMedicineCategoryOptions(custom: readonly string[] = []): string[] {
  return mergeTacticalMedicineCategoryLists(custom);
}

export function itemMatchesTacticalMedicineCategory(categoryField: string, selected: string): boolean {
  const selectedNorm = normalizeTacticalMedicineCategoryLabel(selected);
  if (!selectedNorm) return true;

  const parts = categoryField
    .split(/\s*[/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const candidates = parts.length ? parts : [categoryField.trim()].filter(Boolean);

  return candidates.some((label) => normalizeTacticalMedicineCategoryLabel(label) === selectedNorm);
}

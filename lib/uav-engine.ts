import type { CatalogItem } from "@/lib/types";

export const UAV_ENGINE_TYPES = ["электрический", "двс", "гибридный", "турбореактивный"] as const;

export type UavEngineType = (typeof UAV_ENGINE_TYPES)[number] | "";

export function detectEngineType(specs: CatalogItem["specs"]): UavEngineType {
  const candidate = specs
    .find((item) => item.key.trim().toLowerCase() === "тип двигателя")
    ?.value.trim()
    .toLowerCase();
  if (!candidate) return "";
  const matched = UAV_ENGINE_TYPES.find((option) => option === candidate);
  return matched ?? "";
}

/** Добавляет строку «Тип двигателя» только если значение выбрано. */
export function appendEngineSpec(
  specs: CatalogItem["specs"],
  engineType: string,
): CatalogItem["specs"] {
  const value = engineType.trim();
  if (!value) return specs;
  return [...specs, { key: "Тип двигателя", value }];
}

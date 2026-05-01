import type { DutyLocation } from "@/lib/types";

export function normalizeDutyLocation(raw: unknown): DutyLocation {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s === "deployment" ? "deployment" : "base";
}

export const dutyLocationLabel: Record<DutyLocation, string> = {
  base: "На базе",
  deployment: "В командировке",
};

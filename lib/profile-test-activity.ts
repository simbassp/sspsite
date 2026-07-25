import {
  PROFILE_TEST_ACTIVITY_LABELS,
  type ProfileTestActivityKey,
} from "@/lib/export-test-labels";
import type {
  PersonnelActivityMonth,
  PersonnelActivitySegment,
} from "@/components/personnel/PersonnelIcons";
import type { TestResult } from "@/lib/types";

const ACTIVITY_MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const TEST_ACTIVITY_DEFS: Array<{ key: ProfileTestActivityKey; color: string }> = [
  { key: "trialPassed", color: "#3b82f6" },
  { key: "trialFailed", color: "#f59e0b" },
  { key: "finalPassed", color: "#10b981" },
  { key: "finalFailed", color: "#c42b2b" },
];

function monthKeyFromDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
}

function last12MonthBuckets() {
  const now = new Date();
  const items: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    items.push({
      key: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`,
      label: ACTIVITY_MONTH_LABELS[d.getMonth()],
    });
  }
  return items;
}

function resolveTestActivityKey(row: TestResult): ProfileTestActivityKey | null {
  if (row.type === "final") {
    return row.status === "passed" ? "finalPassed" : "finalFailed";
  }
  if (row.type === "trial") {
    return row.status === "passed" ? "trialPassed" : "trialFailed";
  }
  return null;
}

export function buildProfileTestActivity(rows: TestResult[]) {
  const monthKeys = last12MonthBuckets();
  const categoryKeys = TEST_ACTIVITY_DEFS.map((item) => item.key);
  const buckets = new Map<string, Record<ProfileTestActivityKey, number>>();
  for (const { key } of monthKeys) {
    buckets.set(
      key,
      Object.fromEntries(categoryKeys.map((k) => [k, 0])) as Record<ProfileTestActivityKey, number>,
    );
  }
  const totals = Object.fromEntries(categoryKeys.map((k) => [k, 0])) as Record<ProfileTestActivityKey, number>;

  for (const row of rows) {
    const category = resolveTestActivityKey(row);
    if (!category) continue;
    totals[category] += 1;
    const bucketKey = monthKeyFromDate(row.createdAt);
    if (bucketKey && buckets.has(bucketKey)) {
      buckets.get(bucketKey)![category] += 1;
    }
  }

  const activityByMonth: PersonnelActivityMonth[] = monthKeys.map(({ key, label }) => {
    const bucket = buckets.get(key)!;
    const segments: PersonnelActivitySegment[] = TEST_ACTIVITY_DEFS.map((def) => ({
      key: def.key,
      label: PROFILE_TEST_ACTIVITY_LABELS[def.key],
      value: bucket[def.key],
      color: def.color,
    }));
    return {
      month: label,
      segments,
      total: segments.reduce((sum, seg) => sum + seg.value, 0),
    };
  });

  const activitySummary: PersonnelActivitySegment[] = TEST_ACTIVITY_DEFS.map((def) => ({
    key: def.key,
    label: PROFILE_TEST_ACTIVITY_LABELS[def.key],
    value: totals[def.key],
    color: def.color,
  }));

  return { activityByMonth, activitySummary };
}

import type { PersonnelExamType, PersonnelLicenseCategory } from "@/lib/personnel-catalog";

export type PersonnelTestRosterStats = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

export type ExamFilterStatus = "all" | "passed" | "failed";
export type TriState = "all" | "yes" | "no";
export type TestFilter = "all" | "passed" | "failed";

export type RosterFilterParams = {
  examType: "all" | PersonnelExamType;
  examStatus: ExamFilterStatus;
  license: "all" | PersonnelLicenseCategory;
  trialTest: TestFilter;
  finalTest: TestFilter;
  hits: TriState;
  premiums: TriState;
  dutyStatus: "all" | "base" | "deployment";
};

export const EMPTY_ROSTER_FILTER_PARAMS: RosterFilterParams = {
  examType: "all",
  examStatus: "all",
  license: "all",
  trialTest: "all",
  finalTest: "all",
  hits: "all",
  premiums: "all",
  dutyStatus: "all",
};

export type RosterFilterUser = {
  id: string;
  dutyLocation: "base" | "deployment";
  deploymentDays: number;
  licenseCategories: string[];
  uavHitsTotal: number;
  premiumsTotal: number;
  testStats: PersonnelTestRosterStats;
  testStatsOnDate?: PersonnelTestRosterStats | null;
};

const EMPTY_TEST_STATS: PersonnelTestRosterStats = {
  trialPassed: 0,
  trialFailed: 0,
  finalPassed: 0,
  finalFailed: 0,
};

function resolveUserTestStats(user: RosterFilterUser, testDate: string) {
  if (testDate) return user.testStatsOnDate ?? EMPTY_TEST_STATS;
  return user.testStats ?? EMPTY_TEST_STATS;
}

export function hasActiveRosterFilters(filters: RosterFilterParams, testDate?: string) {
  return hasAdvancedRosterFilters(filters, testDate);
}

export function hasAdvancedRosterFilters(filters: RosterFilterParams, testDate?: string) {
  return (
    !!testDate ||
    (filters.examType !== "all" && filters.examStatus !== "all") ||
    filters.license !== "all" ||
    filters.trialTest !== "all" ||
    filters.finalTest !== "all" ||
    filters.hits !== "all" ||
    filters.premiums !== "all" ||
    filters.dutyStatus !== "all"
  );
}

export function userMatchesRosterFilters(
  user: RosterFilterUser,
  filters: RosterFilterParams,
  examMap: Map<string, Map<string, string>>,
  testDate: string,
) {
  if (filters.examType !== "all" && filters.examStatus !== "all") {
    const passed = examMap.get(user.id)?.get(filters.examType) === "passed";
    if (filters.examStatus === "passed" && !passed) return false;
    if (filters.examStatus === "failed" && passed) return false;
  }

  if (filters.license !== "all" && !user.licenseCategories.includes(filters.license)) return false;

  const ts = resolveUserTestStats(user, testDate);
  if (filters.trialTest === "passed" && ts.trialPassed === 0) return false;
  if (filters.trialTest === "failed") {
    if (testDate ? ts.trialFailed === 0 : ts.trialPassed > 0) return false;
  }
  if (filters.finalTest === "passed" && ts.finalPassed === 0) return false;
  if (filters.finalTest === "failed") {
    if (testDate ? ts.finalFailed === 0 : ts.finalPassed > 0) return false;
  }

  if (filters.hits === "yes" && user.uavHitsTotal === 0) return false;
  if (filters.hits === "no" && user.uavHitsTotal > 0) return false;
  if (filters.premiums === "yes" && user.premiumsTotal === 0) return false;
  if (filters.premiums === "no" && user.premiumsTotal > 0) return false;
  if (filters.dutyStatus !== "all" && user.dutyLocation !== filters.dutyStatus) return false;

  return true;
}

export function calcRosterStats(list: Array<Pick<RosterFilterUser, "dutyLocation" | "deploymentDays" | "uavHitsTotal" | "premiumsTotal">>) {
  const totals = list.reduce(
    (acc, user) => {
      acc.totalEmployees += 1;
      if (user.dutyLocation === "deployment") acc.deployedNow += 1;
      acc.totalDays += user.deploymentDays;
      acc.totalHits += user.uavHitsTotal;
      acc.totalPremiums += user.premiumsTotal;
      return acc;
    },
    { totalEmployees: 0, deployedNow: 0, totalDays: 0, totalHits: 0, totalPremiums: 0 },
  );
  return {
    ...totals,
    avgDays: totals.totalEmployees ? Math.round(totals.totalDays / totals.totalEmployees) : 0,
  };
}

export function parseRosterFilterParams(searchParams: URLSearchParams): RosterFilterParams {
  const read = (key: string) => searchParams.get(key) || "all";
  return {
    examType: read("examType") as RosterFilterParams["examType"],
    examStatus: read("examStatus") as ExamFilterStatus,
    license: read("license") as RosterFilterParams["license"],
    trialTest: read("trialTest") as TestFilter,
    finalTest: read("finalTest") as TestFilter,
    hits: read("hits") as TriState,
    premiums: read("premiums") as TriState,
    dutyStatus: read("dutyStatus") as RosterFilterParams["dutyStatus"],
  };
}

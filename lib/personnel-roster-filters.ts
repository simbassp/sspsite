import type { PersonnelLicenseCategory } from "@/lib/personnel-catalog";

export type PersonnelTestRosterStats = {
  trialPassed: number;
  trialFailed: number;
  finalPassed: number;
  finalFailed: number;
};

export type TestFilter = "all" | "passed" | "failed";

export type RosterFilterParams = {
  license: "all" | PersonnelLicenseCategory;
  trialTest: TestFilter;
  finalTest: TestFilter;
  dutyStatus: "all" | "base" | "deployment";
};

export const EMPTY_ROSTER_FILTER_PARAMS: RosterFilterParams = {
  license: "all",
  trialTest: "all",
  finalTest: "all",
  dutyStatus: "all",
};

export type RosterFilterUser = {
  id: string;
  dutyLocation: "base" | "deployment";
  licenseCategories: string[];
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
    filters.license !== "all" ||
    filters.trialTest !== "all" ||
    filters.finalTest !== "all" ||
    filters.dutyStatus !== "all"
  );
}

export function userMatchesRosterFilters(
  user: RosterFilterUser,
  filters: RosterFilterParams,
  testDate: string,
) {
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

  if (filters.dutyStatus !== "all" && user.dutyLocation !== filters.dutyStatus) return false;

  return true;
}

export function calcRosterStats(list: Array<Pick<RosterFilterUser, "dutyLocation">>) {
  const totals = list.reduce(
    (acc, user) => {
      acc.totalEmployees += 1;
      if (user.dutyLocation === "deployment") acc.deployedNow += 1;
      return acc;
    },
    { totalEmployees: 0, deployedNow: 0 },
  );
  return totals;
}

export function parseRosterFilterParams(searchParams: URLSearchParams): RosterFilterParams {
  const read = (key: string) => searchParams.get(key) || "all";
  return {
    license: read("license") as RosterFilterParams["license"],
    trialTest: read("trialTest") as TestFilter,
    finalTest: read("finalTest") as TestFilter,
    dutyStatus: read("dutyStatus") as RosterFilterParams["dutyStatus"],
  };
}

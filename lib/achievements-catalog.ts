export type TenureMedalMaterial =
  | "wood"
  | "stone"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond";

export type TrialAvatarFrameId =
  | "trial-frame-100"
  | "trial-frame-250"
  | "trial-frame-500"
  | "trial-frame-1000"
  | "trial-frame-5000"
  | "trial-frame-10000";

export type FinalNameColorId =
  | "ach-final-50"
  | "ach-final-100"
  | "ach-final-250"
  | "ach-final-500"
  | "ach-final-1000"
  | "ach-final-5000";

export type TopRankBadgeId = "top-1" | "top-2" | "top-3";

export type AchievementCategory = "tenure" | "trial" | "final" | "top";

export type AchievementDefinition = {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  tierLabel: string;
  tenureMedal?: TenureMedalMaterial;
  trialFrame?: TrialAvatarFrameId;
  finalNameColor?: FinalNameColorId;
  topBadge?: TopRankBadgeId;
  threshold?: number;
  thresholdMonths?: number;
};

export const TENURE_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "tenure-1m", category: "tenure", title: "Месяц с нами", description: "1 месяц с даты трудоустройства", tierLabel: "Деревянная медаль", tenureMedal: "wood", thresholdMonths: 1 },
  { id: "tenure-6m", category: "tenure", title: "Полгода в строю", description: "6 месяцев с даты трудоустройства", tierLabel: "Каменная медаль", tenureMedal: "stone", thresholdMonths: 6 },
  { id: "tenure-1y", category: "tenure", title: "Год службы", description: "1 год с даты трудоустройства", tierLabel: "Бронзовая медаль", tenureMedal: "bronze", thresholdMonths: 12 },
  { id: "tenure-2y", category: "tenure", title: "Два года", description: "2 года с даты трудоустройства", tierLabel: "Серебряная медаль", tenureMedal: "silver", thresholdMonths: 24 },
  { id: "tenure-3y", category: "tenure", title: "Три года", description: "3 года с даты трудоустройства", tierLabel: "Золотая медаль", tenureMedal: "gold", thresholdMonths: 36 },
  { id: "tenure-4y", category: "tenure", title: "Четыре года", description: "4 года с даты трудоустройства", tierLabel: "Платиновая медаль", tenureMedal: "platinum", thresholdMonths: 48 },
  { id: "tenure-5y", category: "tenure", title: "Пять лет", description: "5 лет с даты трудоустройства", tierLabel: "Алмазная медаль", tenureMedal: "diamond", thresholdMonths: 60 },
];

export const TRIAL_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "trial-100", category: "trial", title: "100 пробных", description: "100 сданных пробных тестов", tierLabel: "Рамка I", trialFrame: "trial-frame-100", threshold: 100 },
  { id: "trial-250", category: "trial", title: "250 пробных", description: "250 сданных пробных тестов", tierLabel: "Рамка II", trialFrame: "trial-frame-250", threshold: 250 },
  { id: "trial-500", category: "trial", title: "500 пробных", description: "500 сданных пробных тестов", tierLabel: "Рамка III", trialFrame: "trial-frame-500", threshold: 500 },
  { id: "trial-1000", category: "trial", title: "1000 пробных", description: "1000 сданных пробных тестов", tierLabel: "Рамка IV", trialFrame: "trial-frame-1000", threshold: 1000 },
  { id: "trial-5000", category: "trial", title: "5000 пробных", description: "5000 сданных пробных тестов", tierLabel: "Рамка V", trialFrame: "trial-frame-5000", threshold: 5000 },
  { id: "trial-10000", category: "trial", title: "10000 пробных", description: "10000 сданных пробных тестов", tierLabel: "Рамка VI", trialFrame: "trial-frame-10000", threshold: 10000 },
];

export const FINAL_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "final-50", category: "final", title: "50 итоговых", description: "50 сданных итоговых тестов", tierLabel: "Цвет I", finalNameColor: "ach-final-50", threshold: 50 },
  { id: "final-100", category: "final", title: "100 итоговых", description: "100 сданных итоговых тестов", tierLabel: "Цвет II", finalNameColor: "ach-final-100", threshold: 100 },
  { id: "final-250", category: "final", title: "250 итоговых", description: "250 сданных итоговых тестов", tierLabel: "Цвет III", finalNameColor: "ach-final-250", threshold: 250 },
  { id: "final-500", category: "final", title: "500 итоговых", description: "500 сданных итоговых тестов", tierLabel: "Цвет IV", finalNameColor: "ach-final-500", threshold: 500 },
  { id: "final-1000", category: "final", title: "1000 итоговых", description: "1000 сданных итоговых тестов", tierLabel: "Цвет V", finalNameColor: "ach-final-1000", threshold: 1000 },
  { id: "final-5000", category: "final", title: "5000 итоговых", description: "5000 сданных итоговых тестов", tierLabel: "Цвет VI", finalNameColor: "ach-final-5000", threshold: 5000 },
];

export const ALL_ACHIEVEMENTS: AchievementDefinition[] = [
  ...TENURE_ACHIEVEMENTS,
  ...TRIAL_ACHIEVEMENTS,
  ...FINAL_ACHIEVEMENTS,
];

const ACHIEVEMENT_MAP = new Map(ALL_ACHIEVEMENTS.map((item) => [item.id, item]));

export function getAchievementDefinition(id: string): AchievementDefinition | null {
  return ACHIEVEMENT_MAP.get(id) ?? null;
}

export type AchievementProgress = {
  employmentMonths: number | null;
  trialPassed: number;
  finalPassed: number;
};

export function computeUnlockedAchievementIds(progress: AchievementProgress): string[] {
  const unlocked: string[] = [];
  for (const item of TENURE_ACHIEVEMENTS) {
    if (progress.employmentMonths != null && progress.employmentMonths >= (item.thresholdMonths ?? 0)) {
      unlocked.push(item.id);
    }
  }
  for (const item of TRIAL_ACHIEVEMENTS) {
    if (progress.trialPassed >= (item.threshold ?? 0)) unlocked.push(item.id);
  }
  for (const item of FINAL_ACHIEVEMENTS) {
    if (progress.finalPassed >= (item.threshold ?? 0)) unlocked.push(item.id);
  }
  return unlocked;
}

export function unlockedTenureMedals(unlockedIds: string[]): TenureMedalMaterial[] {
  return TENURE_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id))
    .map((item) => item.tenureMedal)
    .filter((item): item is TenureMedalMaterial => Boolean(item));
}

export function unlockedTrialFrames(unlockedIds: string[]): TrialAvatarFrameId[] {
  return TRIAL_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id))
    .map((item) => item.trialFrame)
    .filter((item): item is TrialAvatarFrameId => Boolean(item));
}

export function unlockedFinalNameColors(unlockedIds: string[]): FinalNameColorId[] {
  return FINAL_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id))
    .map((item) => item.finalNameColor)
    .filter((item): item is FinalNameColorId => Boolean(item));
}

export function normalizeTrialAvatarFrame(raw: unknown): TrialAvatarFrameId | null {
  const value = String(raw ?? "").trim();
  return TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === value) ? (value as TrialAvatarFrameId) : null;
}

export function normalizeFinalNameColor(raw: unknown): FinalNameColorId | null {
  const value = String(raw ?? "").trim();
  return FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === value) ? (value as FinalNameColorId) : null;
}

export function trialAvatarFrameClass(frame: TrialAvatarFrameId | null | undefined): string {
  if (!frame) return "";
  return `avatar-frame avatar-frame--${frame}`;
}

export function finalNameColorClass(color: FinalNameColorId | null | undefined): string {
  if (!color) return "";
  return `profile-name-color profile-name-color--${color}`;
}

export function finalNameColorLabel(color: FinalNameColorId): string {
  const item = FINAL_ACHIEVEMENTS.find((entry) => entry.finalNameColor === color);
  return item?.tierLabel ?? color;
}

export function trialFrameLabel(frame: TrialAvatarFrameId): string {
  const item = TRIAL_ACHIEVEMENTS.find((entry) => entry.trialFrame === frame);
  return item?.tierLabel ?? frame;
}

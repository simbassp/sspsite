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
  | "trial-frame-1500"
  | "trial-frame-2000";

export type FinalNameColorId =
  | "ach-final-5"
  | "ach-final-10"
  | "ach-final-15"
  | "ach-final-20"
  | "ach-final-30"
  | "ach-final-40";

export type BankAvatarOverlayId =
  | "bank-overlay-flame"
  | "bank-overlay-crown"
  | "bank-overlay-diamond"
  | "bank-overlay-aurora-flame"
  | "bank-overlay-geran";

export type TopRankBadgeId = "top-1" | "top-2" | "top-3";

export type AchievementCategory = "tenure" | "trial" | "final" | "bank" | "top";

export type AchievementDefinition = {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  tierLabel: string;
  tenureMedal?: TenureMedalMaterial;
  trialFrame?: TrialAvatarFrameId;
  finalNameColor?: FinalNameColorId;
  bankOverlay?: BankAvatarOverlayId;
  topBadge?: TopRankBadgeId;
  threshold?: number;
  thresholdMonths?: number;
};

export const TENURE_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "tenure-1m", category: "tenure", title: "Месяц с нами", description: "1 месяц с даты трудоустройства", tierLabel: "Деревянная медаль", tenureMedal: "wood", thresholdMonths: 1 },
  { id: "tenure-3m", category: "tenure", title: "Три месяца", description: "3 месяца с даты трудоустройства", tierLabel: "Каменная медаль", tenureMedal: "stone", thresholdMonths: 3 },
  { id: "tenure-6m", category: "tenure", title: "Полгода в строю", description: "6 месяцев с даты трудоустройства", tierLabel: "Бронзовая медаль", tenureMedal: "bronze", thresholdMonths: 6 },
  { id: "tenure-1y", category: "tenure", title: "Год службы", description: "1 год с даты трудоустройства", tierLabel: "Серебряная медаль", tenureMedal: "silver", thresholdMonths: 12 },
  { id: "tenure-18m", category: "tenure", title: "Полтора года", description: "1,5 года с даты трудоустройства", tierLabel: "Золотая медаль", tenureMedal: "gold", thresholdMonths: 18 },
  { id: "tenure-2y", category: "tenure", title: "Два года", description: "2 года с даты трудоустройства", tierLabel: "Алмазная медаль", tenureMedal: "diamond", thresholdMonths: 24 },
];

export const TRIAL_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "trial-100", category: "trial", title: "100 пробных", description: "100 сданных пробных тестов", tierLabel: "Голубая рамка", trialFrame: "trial-frame-100", threshold: 100 },
  { id: "trial-250", category: "trial", title: "250 пробных", description: "250 сданных пробных тестов", tierLabel: "Зелёная рамка", trialFrame: "trial-frame-250", threshold: 250 },
  { id: "trial-500", category: "trial", title: "500 пробных", description: "500 сданных пробных тестов", tierLabel: "Красная рамка", trialFrame: "trial-frame-500", threshold: 500 },
  { id: "trial-1000", category: "trial", title: "1000 пробных", description: "1000 сданных пробных тестов", tierLabel: "Золотая рамка", trialFrame: "trial-frame-1000", threshold: 1000 },
  { id: "trial-1500", category: "trial", title: "1500 пробных", description: "1500 сданных пробных тестов", tierLabel: "Бирюзово-фиолетовая рамка", trialFrame: "trial-frame-1500", threshold: 1500 },
  { id: "trial-2000", category: "trial", title: "2000 пробных", description: "2000 сданных пробных тестов", tierLabel: "Алмазная рамка", trialFrame: "trial-frame-2000", threshold: 2000 },
];

export const FINAL_ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "final-5", category: "final", title: "5 итоговых", description: "5 сданных итоговых тестов", tierLabel: "Голубой", finalNameColor: "ach-final-5", threshold: 5 },
  { id: "final-10", category: "final", title: "10 итоговых", description: "10 сданных итоговых тестов", tierLabel: "Зелёный", finalNameColor: "ach-final-10", threshold: 10 },
  { id: "final-15", category: "final", title: "15 итоговых", description: "15 сданных итоговых тестов", tierLabel: "Красный", finalNameColor: "ach-final-15", threshold: 15 },
  { id: "final-20", category: "final", title: "20 итоговых", description: "20 сданных итоговых тестов", tierLabel: "Золотой перелив", finalNameColor: "ach-final-20", threshold: 20 },
  { id: "final-30", category: "final", title: "30 итоговых", description: "30 сданных итоговых тестов", tierLabel: "Бирюзово-фиолетовый", finalNameColor: "ach-final-30", threshold: 30 },
  { id: "final-40", category: "final", title: "40 итоговых", description: "40 сданных итоговых тестов", tierLabel: "Алмазный", finalNameColor: "ach-final-40", threshold: 40 },
];

export const BANK_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "bank-5",
    category: "bank",
    title: "5 прохождений банка",
    description: "5 полных прохождений теста «Весь банк»",
    tierLabel: "Пламя",
    bankOverlay: "bank-overlay-flame",
    threshold: 5,
  },
  {
    id: "bank-10",
    category: "bank",
    title: "10 прохождений банка",
    description: "10 полных прохождений теста «Весь банк»",
    tierLabel: "Корона",
    bankOverlay: "bank-overlay-crown",
    threshold: 10,
  },
  {
    id: "bank-20",
    category: "bank",
    title: "20 прохождений банка",
    description: "20 полных прохождений теста «Весь банк»",
    tierLabel: "Алмаз",
    bankOverlay: "bank-overlay-diamond",
    threshold: 20,
  },
  {
    id: "bank-30",
    category: "bank",
    title: "30 прохождений банка",
    description: "30 полных прохождений теста «Весь банк»",
    tierLabel: "Сине-фиолетовое пламя",
    bankOverlay: "bank-overlay-aurora-flame",
    threshold: 30,
  },
  {
    id: "bank-50",
    category: "bank",
    title: "50 прохождений банка",
    description: "50 полных прохождений теста «Весь банк»",
    tierLabel: "Герань БПЛА",
    bankOverlay: "bank-overlay-geran",
    threshold: 50,
  },
];

export const ALL_ACHIEVEMENTS: AchievementDefinition[] = [
  ...TENURE_ACHIEVEMENTS,
  ...TRIAL_ACHIEVEMENTS,
  ...FINAL_ACHIEVEMENTS,
  ...BANK_ACHIEVEMENTS,
];

const ACHIEVEMENT_MAP = new Map(ALL_ACHIEVEMENTS.map((item) => [item.id, item]));

export function getAchievementDefinition(id: string): AchievementDefinition | null {
  return ACHIEVEMENT_MAP.get(id) ?? null;
}

export type AchievementProgress = {
  employmentMonths: number | null;
  trialPassed: number;
  finalPassed: number;
  bankCompletions: number;
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
  for (const item of BANK_ACHIEVEMENTS) {
    if (progress.bankCompletions >= (item.threshold ?? 0)) unlocked.push(item.id);
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

export function unlockedBankOverlays(unlockedIds: string[]): BankAvatarOverlayId[] {
  return BANK_ACHIEVEMENTS.filter((item) => unlockedIds.includes(item.id))
    .map((item) => item.bankOverlay)
    .filter((item): item is BankAvatarOverlayId => Boolean(item));
}

export function normalizeBankAvatarOverlay(raw: unknown): BankAvatarOverlayId | null {
  const value = String(raw ?? "").trim();
  return BANK_ACHIEVEMENTS.some((item) => item.bankOverlay === value) ? (value as BankAvatarOverlayId) : null;
}

export function bankAvatarOverlayClass(overlay: BankAvatarOverlayId | null | undefined): string {
  if (!overlay) return "";
  return `avatar-bank-overlay avatar-bank-overlay--${overlay.replace("bank-overlay-", "")}`;
}

export function bankOverlayLabel(overlay: BankAvatarOverlayId): string {
  const item = BANK_ACHIEVEMENTS.find((entry) => entry.bankOverlay === overlay);
  return item?.tierLabel ?? overlay;
}

const LEGACY_TRIAL_FRAMES: Record<string, TrialAvatarFrameId> = {
  "trial-frame-5000": "trial-frame-1500",
  "trial-frame-10000": "trial-frame-2000",
};

const LEGACY_FINAL_NAME_COLORS: Record<string, FinalNameColorId> = {
  "ach-final-50": "ach-final-5",
  "ach-final-100": "ach-final-10",
  "ach-final-250": "ach-final-15",
  "ach-final-500": "ach-final-20",
  "ach-final-1000": "ach-final-30",
  "ach-final-5000": "ach-final-40",
};

export function normalizeTrialAvatarFrame(raw: unknown): TrialAvatarFrameId | null {
  const value = String(raw ?? "").trim();
  const mapped = LEGACY_TRIAL_FRAMES[value] ?? value;
  return TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === mapped) ? (mapped as TrialAvatarFrameId) : null;
}

export function normalizeFinalNameColor(raw: unknown): FinalNameColorId | null {
  const value = String(raw ?? "").trim();
  const mapped = LEGACY_FINAL_NAME_COLORS[value] ?? value;
  return FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === mapped) ? (mapped as FinalNameColorId) : null;
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

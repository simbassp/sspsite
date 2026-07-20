export type { GameModeId } from "@/lib/game-modes";
export { GAME_MODE_CONFIGS as GAME_MODES } from "@/lib/game-modes";

export const GAME_PLAYER_PREVIEW = {
  level: 12,
  levelTitle: "Специалист",
  xp: 2840,
  xpToNext: 3200,
  streak: 4,
  accuracy: 87,
  bestRank: "Серебро II",
};

export const GAME_SEASON_LEADERBOARD = [
  { place: 1, name: "Азат", callsign: "Сталин", xp: 4820, delta: "+120" },
  { place: 2, name: "Денис", callsign: "Симба", xp: 4510, delta: "+95" },
  { place: 3, name: "Максим", callsign: "Хонда", xp: 4280, delta: "+80" },
  { place: 4, name: "Ленар", callsign: "Мелкий", xp: 3910, delta: "+42" },
];

export const GAME_RECENT_ACHIEVEMENTS = [
  { id: "a1", title: "10 побед подряд", user: "Денис Симба", icon: "fire" as const },
  { id: "a2", title: "Ответил за 3 сек", user: "Азат Сталин", icon: "bolt" as const },
  { id: "a3", title: "Эксперт FPV", user: "Максим Хонда", icon: "star" as const },
];

export const GAME_TRAINING_PICKS = [
  { id: "fp1", title: "FP-1", hint: "Скорость и дальность" },
  { id: "luty", title: "Лютый", hint: "Сравнение ТТХ" },
  { id: "bars", title: "Барс", hint: "Угадай БПЛА" },
];

export const GAME_DAILY_TOURNAMENT = {
  title: "Вечерний турнир",
  rewards: ["1 место — +100 XP", "2 место — +75 XP", "3 место — +50 XP"],
};

export function getDailyTournamentTargetMs() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function formatCountdown(totalMs: number) {
  const safe = Math.max(0, totalMs);
  const totalSec = Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

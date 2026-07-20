export type { GameModeId } from "@/lib/game-modes";
export { GAME_MODE_CONFIGS as GAME_MODES } from "@/lib/game-modes";

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

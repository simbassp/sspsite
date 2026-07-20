export type GameModeId = "duel" | "team" | "blitz" | "survival" | "ladder" | "tournament";

export type GameModeTone = "red" | "blue" | "orange" | "green" | "purple" | "amber";

export type GameModeConfig = {
  id: GameModeId;
  title: string;
  description: string;
  tone: GameModeTone;
  badge?: string;
  onlineHint?: string;
  /** Сколько вопросов подготовить (null = большой запас для таймера). */
  prepareCount: number | null;
  /** Общий лимит сессии в секундах (блиц). */
  totalTimeSec: number | null;
  /** Лимит на один вопрос, если нет общего таймера. */
  perQuestionSec: number;
  failOnWrong: boolean;
  /** Показывать правильный ответ перед следующим вопросом. */
  revealFeedbackMs: number;
  /** Симулировать соперника (дуэль / команды). */
  simulatedOpponent: boolean;
  opponentKind: "duel" | "team" | null;
};

export const GAME_MODE_CONFIGS: GameModeConfig[] = [
  {
    id: "duel",
    title: "Дуэль",
    description: "10 одинаковых вопросов против другого игрока онлайн. Побеждает точность и скорость.",
    tone: "red",
    badge: "Топ",
    onlineHint: "бот-соперник",
    prepareCount: 10,
    totalTimeSec: null,
    perQuestionSec: 12,
    failOnWrong: false,
    revealFeedbackMs: 900,
    simulatedOpponent: true,
    opponentKind: "duel",
  },
  {
    id: "team",
    title: "Командный бой",
    description: "Две команды соревнуются в общем зачёте по ТТХ и распознаванию БПЛА.",
    tone: "blue",
    onlineHint: "бот-команда",
    prepareCount: 15,
    totalTimeSec: null,
    perQuestionSec: 12,
    failOnWrong: false,
    revealFeedbackMs: 900,
    simulatedOpponent: true,
    opponentKind: "team",
  },
  {
    id: "blitz",
    title: "Блиц",
    description: "60 секунд — максимум правильных ответов. Ежедневный рейтинг обнуляется в полночь.",
    tone: "orange",
    badge: "Ежедневно",
    prepareCount: 80,
    totalTimeSec: 60,
    perQuestionSec: 10,
    failOnWrong: false,
    revealFeedbackMs: 0,
    simulatedOpponent: false,
    opponentKind: null,
  },
  {
    id: "survival",
    title: "Выживание",
    description: "Серия вопросов подряд. Ошибка — начинаете сначала. Боритесь за рекорд лестницы.",
    tone: "green",
    prepareCount: 200,
    totalTimeSec: null,
    perQuestionSec: 12,
    failOnWrong: true,
    revealFeedbackMs: 1200,
    simulatedOpponent: false,
    opponentKind: null,
  },
  {
    id: "ladder",
    title: "Лестница",
    description: "100 вопросов без права на ошибку. Лучший результат сохраняется в таблице рекордов.",
    tone: "purple",
    prepareCount: 100,
    totalTimeSec: null,
    perQuestionSec: 10,
    failOnWrong: true,
    revealFeedbackMs: 800,
    simulatedOpponent: false,
    opponentKind: null,
  },
  {
    id: "tournament",
    title: "Турнир",
    description: "Каждый вечер в 20:00 — один тест для всех. Автоматический рейтинг и награды XP.",
    tone: "amber",
    badge: "20:00",
    prepareCount: 15,
    totalTimeSec: null,
    perQuestionSec: 12,
    failOnWrong: false,
    revealFeedbackMs: 900,
    simulatedOpponent: false,
    opponentKind: null,
  },
];

const MODE_MAP = new Map(GAME_MODE_CONFIGS.map((mode) => [mode.id, mode]));

export function isGameModeId(value: string): value is GameModeId {
  return MODE_MAP.has(value as GameModeId);
}

export function getGameModeConfig(modeId: GameModeId): GameModeConfig {
  return MODE_MAP.get(modeId)!;
}

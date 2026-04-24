import { TestQuestion } from "@/lib/types";

type SeedQuestion = {
  type: "trial" | "final";
  text: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
};

const BASE_QUESTIONS: SeedQuestion[] = [
  {
    type: "trial",
    text: "Что делать при потере связи с БПЛА?",
    options: ["Продолжить полет", "Сообщить по протоколу", "Игнорировать"],
    correctIndex: 1,
    timeLimitSec: 35,
  },
  {
    type: "trial",
    text: "Первое действие при тревоге?",
    options: ["Ожидать", "Проверить оборудование", "Покинуть пост"],
    correctIndex: 1,
    timeLimitSec: 30,
  },
  {
    type: "trial",
    text: "Как фиксировать результат тренировки?",
    options: ["Устно", "В журнале", "Не фиксировать"],
    correctIndex: 1,
    timeLimitSec: 30,
  },
  {
    type: "final",
    text: "Ключевой канал обнаружения низколетящего БПЛА?",
    options: ["Визуальный пост", "Только метеосводка", "Архив новостей"],
    correctIndex: 0,
    timeLimitSec: 45,
  },
  {
    type: "final",
    text: "Что критично при работе РЭБ?",
    options: ["Согласование диапазонов", "Случайная частота", "Отключенный журнал"],
    correctIndex: 0,
    timeLimitSec: 45,
  },
  {
    type: "final",
    text: "Минимум для допуска к итоговому тесту?",
    options: ["Регистрация", "Изучение материала и пробный тест", "Только наличие позывного"],
    correctIndex: 1,
    timeLimitSec: 40,
  },
  {
    type: "final",
    text: "При угрозе повторной атаки нужно:",
    options: ["Снять наблюдение", "Усилить мониторинг", "Отключить средства связи"],
    correctIndex: 1,
    timeLimitSec: 40,
  },
  {
    type: "final",
    text: "После завершения операции сотрудник:",
    options: ["Игнорирует отчет", "Фиксирует действия и итоги", "Удаляет записи"],
    correctIndex: 1,
    timeLimitSec: 40,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultQuestionBank(): TestQuestion[] {
  return BASE_QUESTIONS.map((item, index) => ({
    id: uid("q"),
    type: item.type,
    text: item.text,
    options: item.options,
    correctIndex: item.correctIndex,
    timeLimitSec: item.timeLimitSec,
    order: index + 1,
    isActive: true,
    createdAt: new Date().toISOString(),
  }));
}

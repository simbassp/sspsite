import { AppData, Position } from "@/lib/types";
import { createDefaultQuestionBank } from "@/lib/test-question-bank";

const defaultPosition: Position = "Специалист";

export const STORAGE_KEY = "ssp_app_data_v1";
export const SESSION_COOKIE = "ssp_session";

export const seedData: AppData = {
  users: [
    {
      id: "u-admin",
      role: "admin",
      login: "admin",
      password: "admin123",
      name: "Администратор ССП",
      callsign: "Центр-01",
      position: "Главный специалист",
      canManageContent: true,
      permissions: {
        news: true,
        tests: true,
        uav: true,
        counteraction: true,
        users: true,
      },
      status: "active",
    },
    {
      id: "u-employee-1",
      role: "employee",
      login: "petrov",
      password: "123456",
      name: "Иван Петров",
      callsign: "Бастион-12",
      position: defaultPosition,
      canManageContent: false,
      permissions: {
        news: false,
        tests: false,
        uav: false,
        counteraction: false,
        users: false,
      },
      status: "active",
    },
    {
      id: "u-employee-2",
      role: "employee",
      login: "sidorov",
      password: "123456",
      name: "Алексей Сидоров",
      callsign: "Шторм-07",
      position: "Ведущий специалист",
      canManageContent: false,
      permissions: {
        news: false,
        tests: false,
        uav: false,
        counteraction: false,
        users: false,
      },
      status: "active",
    },
  ],
  news: [
    {
      id: "n-1",
      title: "Обновление базы противодействия",
      body: "Добавлены новые карточки вооружения и уточнены ТТХ по действующим средствам.",
      priority: "high",
      createdAt: "2026-04-23T09:00:00.000Z",
      author: "Администратор",
    },
    {
      id: "n-2",
      title: "Итоговый тест доступен до 30 числа",
      body: "Приступить к итоговому тесту можно в разделе тестирования. Напоминаем о строгом режиме.",
      priority: "normal",
      createdAt: "2026-04-22T12:00:00.000Z",
      author: "Система",
    },
  ],
  counteraction: [
    {
      id: "c-ak74m",
      title: "АК-74М",
      category: "Оружие",
      summary: "Базовая карточка для быстрого просмотра параметров.",
      image:
        "https://images.unsplash.com/photo-1511884642898-4c92249e20b6?auto=format&fit=crop&w=1200&q=80",
      specs: [
        { key: "Дальность", value: "3150 м" },
        { key: "Вес", value: "3.9 кг" },
      ],
      details: {
        overview: "Надежное стрелковое оружие для стандартных задач подразделения.",
        tth: "Калибр 5.45 мм, магазин 30, эффективная дальность до 500 м.",
        usage: "Применяется в составе стандартного вооружения боевых расчетов.",
        materials: "Инструкция, схема разборки, видео обслуживания.",
      },
    },
    {
      id: "c-jammer",
      title: "Комплекс подавления",
      category: "Подавление",
      summary: "Средство РЭБ для подавления управляющих каналов БПЛА.",
      image:
        "https://images.unsplash.com/photo-1581092918484-8313ac49f9cc?auto=format&fit=crop&w=1200&q=80",
      specs: [
        { key: "Радиус", value: "2 км" },
        { key: "Диапазон", value: "UHF" },
      ],
      details: {
        overview: "Мобильный комплекс с быстрым развертыванием на позиции.",
        tth: "Рабочие диапазоны UHF/VHF, автономность 4 часа.",
        usage: "Используется для временного подавления каналов связи БПЛА.",
        materials: "Паспорт изделия, схема применения, карта диапазонов.",
      },
    },
  ],
  uav: [
    {
      id: "u-fpv-01",
      title: "FPV-01",
      category: "FPV",
      summary: "Ударный FPV-дрон короткой/средней дальности.",
      image:
        "https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1200&q=80",
      specs: [
        { key: "Дальность", value: "8 км" },
        { key: "Скорость", value: "120 км/ч" },
      ],
      details: {
        overview: "Высокая маневренность и быстрое наведение на цели.",
        tth: "Рабочая высота 50-600 м, длительность полета до 20 минут.",
        usage: "Применяется по точечным целям и в разведывательно-ударном контуре.",
        materials: "Фото, схема БЧ, рекомендации по обнаружению.",
      },
    },
    {
      id: "u-scout-x2",
      title: "Scout-X2",
      category: "Разведка",
      summary: "Разведывательная платформа для наблюдения и корректировки.",
      image:
        "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=80",
      specs: [
        { key: "Время", value: "60 мин" },
        { key: "Высота", value: "1500 м" },
      ],
      details: {
        overview: "Поддерживает длительное патрулирование в заданном районе.",
        tth: "Крейсерская скорость 70 км/ч, дальность до 20 км.",
        usage: "Используется для разведки и передачи координат в штаб.",
        materials: "Руководство оператора, частотные таблицы, фото-сессии.",
      },
    },
  ],
  testQuestions: createDefaultQuestionBank(),
  testConfig: {
    trialQuestionCount: 3,
    finalQuestionCount: 5,
  },
  testResults: [
    {
      id: "t-1",
      userId: "u-employee-1",
      type: "final",
      status: "passed",
      score: 87,
      createdAt: "2026-04-10T08:00:00.000Z",
    },
    {
      id: "t-2",
      userId: "u-employee-2",
      type: "final",
      status: "failed",
      score: 61,
      createdAt: "2026-04-12T08:00:00.000Z",
    },
  ],
  finalAttempt: null,
};

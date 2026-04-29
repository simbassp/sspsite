export type Role = "employee" | "admin";

export type Position =
  | "Младший специалист"
  | "Специалист"
  | "Ведущий специалист"
  | "Главный специалист"
  | "Командир взвода";

export type UserStatus = "active" | "inactive";
export type TestType = "trial" | "final";
export type TestStatus = "passed" | "failed";

export interface UserPermissions {
  news: boolean;
  tests: boolean;
  results: boolean;
  /** Сброс окна попыток итогового теста (отдельно от просмотра результатов). */
  resetResults: boolean;
  uav: boolean;
  counteraction: boolean;
  users: boolean;
  online: boolean;
}

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  callsign: string;
  position: Position;
  canManageContent: boolean;
  permissions: UserPermissions;
}

export interface UserRecord extends SessionUser {
  login: string;
  password: string;
  status: UserStatus;
  isOnline?: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  priority: "high" | "normal";
  kind?: "news" | "update";
  createdAt: string;
  author: string;
  textStyle?: NewsTextStyle;
}

export interface NewsTextStyle {
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface CatalogItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  image: string;
  specs: Array<{ key: string; value: string }>;
  details: {
    overview: string;
    tth: string;
    usage: string;
    materials: string;
  };
}

export interface TestResult {
  id: string;
  userId: string;
  type: TestType;
  status: TestStatus;
  score: number;
  createdAt: string;
  /** Время начала попытки (если сохраняется в БД). */
  startedAt?: string | null;
  /** Время завершения попытки (если сохраняется в БД). */
  finishedAt?: string | null;
  /** Фактическая длительность попытки в секундах. */
  durationSeconds?: number | null;
  /** Признак завершённой попытки (если хранится в БД). */
  isCompleted?: boolean | null;
  /** Всего вопросов в попытке (если известно). */
  questionsTotal?: number | null;
  /** Верных ответов (если известно). */
  questionsCorrect?: number | null;
  /** Номер итоговой попытки в текущем окне (1…MAX). Только для type === \"final\". */
  finalAttemptIndex?: number | null;
}

export interface TestQuestion {
  id: string;
  type: TestType;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
  order: number;
  isActive: boolean;
  createdAt: string;
}

export interface TestConfig {
  trialQuestionCount: number;
  finalQuestionCount: number;
  /** Общее время на один вопрос в пробном и итоговом тесте (сек). */
  timePerQuestionSec: number;
  /** Вопросы из ТТХ карточек БПЛА; при выключении — только банк из БД. */
  uavAutoGeneration: boolean;
}

export interface FinalAttemptState {
  userId: string;
  startedAt: string;
  questionIndex: number;
  answers: Record<number, string>;
}

export interface AppData {
  users: UserRecord[];
  news: NewsItem[];
  counteraction: CatalogItem[];
  uav: CatalogItem[];
  testQuestions: TestQuestion[];
  testConfig: TestConfig;
  testResults: TestResult[];
  finalAttempt: FinalAttemptState | null;
}

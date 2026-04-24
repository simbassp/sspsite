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

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  callsign: string;
  position: Position;
}

export interface UserRecord extends SessionUser {
  login: string;
  password: string;
  status: UserStatus;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  priority: "high" | "normal";
  createdAt: string;
  author: string;
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
  testResults: TestResult[];
  finalAttempt: FinalAttemptState | null;
}

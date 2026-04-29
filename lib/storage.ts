"use client";

import { seedData, STORAGE_KEY } from "@/lib/seed";
import { normalizeTestConfig } from "@/lib/test-config";
import { createDefaultQuestionBank } from "@/lib/test-question-bank";
import {
  AppData,
  CatalogItem,
  FinalAttemptState,
  Position,
  SessionUser,
  TestConfig,
  TestQuestion,
  TestResult,
  UserPermissions,
  UserRecord,
} from "@/lib/types";

const positions: Position[] = [
  "Младший специалист",
  "Специалист",
  "Ведущий специалист",
  "Главный специалист",
  "Командир взвода",
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultPermissions(user: Partial<UserRecord>): UserPermissions {
  const isAdmin = user.role === "admin";
  const legacyContent = user.canManageContent === true;
  return {
    news: isAdmin || legacyContent,
    tests: isAdmin || legacyContent,
    results: isAdmin || legacyContent,
    resetResults: isAdmin,
    uav: isAdmin || legacyContent,
    counteraction: isAdmin || legacyContent,
    users: isAdmin,
    online: isAdmin,
  };
}

function withNormalizedPermissions(user: UserRecord): UserRecord {
  const normalized = {
    ...defaultPermissions(user),
    ...(user.permissions ?? {}),
  };
  return {
    ...user,
    permissions: normalized,
    canManageContent: normalized.news || normalized.tests || normalized.uav || normalized.counteraction,
  };
}

export function getPositions() {
  return positions;
}

export function readData(): AppData {
  if (typeof window === "undefined") {
    return seedData;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const normalizedUsers = (parsed.users ?? seedData.users).map((user) =>
      withNormalizedPermissions({
        ...user,
        canManageContent: user.canManageContent ?? false,
      } as UserRecord),
    );
    const normalized: AppData = {
      ...seedData,
      ...parsed,
      users: normalizedUsers,
      testQuestions:
        parsed.testQuestions && parsed.testQuestions.length > 0
          ? parsed.testQuestions
          : createDefaultQuestionBank(),
    };
    return normalized;
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return seedData;
  }
}

export function writeData(data: AppData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function authenticate(login: string, password: string): SessionUser | null {
  const data = readData();
  const user = data.users.find(
    (item) => item.login === login && item.password === password && item.status === "active",
  );
  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    name: user.name,
    callsign: user.callsign,
    position: user.position,
    canManageContent: user.canManageContent,
    permissions: user.permissions,
  };
}

export function registerEmployee(payload: {
  login: string;
  name: string;
  callsign: string;
  password: string;
  position: Position;
}) {
  const data = readData();
  const exists = data.users.some((u) => u.login.toLowerCase() === payload.login.toLowerCase());
  if (exists) {
    return { ok: false as const, error: "Логин уже существует." };
  }

  const user: UserRecord = {
    id: uid("u"),
    role: "employee",
    login: payload.login,
    name: payload.name,
    callsign: payload.callsign,
    password: payload.password,
    position: payload.position,
    canManageContent: false,
    permissions: {
      news: false,
      tests: false,
      results: false,
      resetResults: false,
      uav: false,
      counteraction: false,
      users: false,
      online: false,
    },
    status: "active",
  };

  data.users.unshift(user);
  writeData(data);
  return { ok: true as const };
}

export function listUsers() {
  return readData().users;
}

/**
 * Подмешанный ранее локальный список (демо, офлайн) может расходиться с `app_users` в Supabase.
 * После успешной выгрузки с сервера перезаписываем кэш, чтобы и админка, и счётчики не путались.
 */
export function replaceAllUsersInLocalCache(nextUsers: UserRecord[]) {
  if (typeof window === "undefined") return;
  const data = readData();
  data.users = nextUsers.map((u) =>
    withNormalizedPermissions({
      ...u,
      password: u.password ?? "",
    } as UserRecord),
  );
  writeData(data);
}

export function updateUser(
  userId: string,
  patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status" | "canManageContent" | "permissions" | "role">>,
) {
  const data = readData();
  data.users = data.users.map((user) => {
    if (user.id !== userId) return user;
    const mergedPermissions = patch.permissions
      ? { ...withNormalizedPermissions(user).permissions, ...patch.permissions }
      : withNormalizedPermissions(user).permissions;
    return withNormalizedPermissions({
      ...user,
      ...patch,
      permissions: mergedPermissions,
      canManageContent:
        patch.canManageContent ??
        (mergedPermissions.news ||
          mergedPermissions.tests ||
          mergedPermissions.uav ||
          mergedPermissions.counteraction),
    });
  });
  writeData(data);
}

export function deleteUser(userId: string) {
  const data = readData();
  data.users = data.users.filter((u) => u.id !== userId);
  data.testResults = data.testResults.filter((r) => r.userId !== userId);
  if (data.finalAttempt?.userId === userId) {
    data.finalAttempt = null;
  }
  writeData(data);
}

export function listNews() {
  return readData().news;
}

export function addNews(payload: {
  title: string;
  body: string;
  priority: "high" | "normal";
  author: string;
  authorPosition?: Position | null;
  textStyle?: { fontSize: number; bold: boolean; italic: boolean; underline: boolean };
  kind?: "news" | "update";
}) {
  const data = readData();
  data.news.unshift({
    id: uid("n"),
    title: payload.title,
    body: payload.body,
    priority: payload.priority,
    kind: payload.kind ?? "news",
    author: payload.author,
    authorPosition: payload.authorPosition ?? null,
    createdAt: new Date().toISOString(),
    textStyle: payload.textStyle,
  });
  writeData(data);
}

export function updateNewsItem(
  id: string,
  patch: {
    title?: string;
    body?: string;
    priority?: "high" | "normal";
    kind?: "news" | "update";
    textStyle?: { fontSize: number; bold: boolean; italic: boolean; underline: boolean };
  },
) {
  const data = readData();
  data.news = data.news.map((item) => (item.id === id ? { ...item, ...patch } : item));
  writeData(data);
}

export function removeNewsItem(id: string) {
  const data = readData();
  data.news = data.news.filter((item) => item.id !== id);
  writeData(data);
}

export function listCounteraction() {
  return readData().counteraction;
}

export function listUav() {
  return readData().uav;
}

export function getCounteractionById(id: string) {
  return readData().counteraction.find((item) => item.id === id) ?? null;
}

export function upsertCounteractionItem(
  input: Omit<CatalogItem, "id"> & { id?: string },
) {
  const data = readData();
  const item: CatalogItem = {
    ...input,
    id: input.id ?? uid("cnt"),
  };
  const exists = data.counteraction.some((entry) => entry.id === item.id);
  data.counteraction = exists
    ? data.counteraction.map((entry) => (entry.id === item.id ? item : entry))
    : [item, ...data.counteraction];
  writeData(data);
  return item;
}

export function removeCounteractionItem(itemId: string) {
  const data = readData();
  data.counteraction = data.counteraction.filter((item) => item.id !== itemId);
  writeData(data);
}

export function getUavById(id: string) {
  return readData().uav.find((item) => item.id === id) ?? null;
}

export function upsertUavItem(
  input: Omit<CatalogItem, "id"> & { id?: string },
) {
  const data = readData();
  const item: CatalogItem = {
    ...input,
    id: input.id ?? uid("uav"),
  };
  const exists = data.uav.some((entry) => entry.id === item.id);
  data.uav = exists ? data.uav.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...data.uav];
  writeData(data);
  return item;
}

export function removeUavItem(itemId: string) {
  const data = readData();
  data.uav = data.uav.filter((item) => item.id !== itemId);
  writeData(data);
}

export function listTestResults() {
  return readData().testResults;
}

export function listTestQuestions(type?: "trial" | "final") {
  const all = readData().testQuestions ?? [];
  const filtered = type ? all.filter((q) => q.type === type) : all;
  return [...filtered].sort((a, b) => a.order - b.order);
}

export function getTestConfig(): TestConfig {
  return normalizeTestConfig(readData().testConfig);
}

export function updateTestConfig(config: TestConfig) {
  const data = readData();
  data.testConfig = normalizeTestConfig(config);
  writeData(data);
}

export function upsertTestQuestion(
  input: Omit<TestQuestion, "id" | "createdAt"> & { id?: string; createdAt?: string },
) {
  const data = readData();
  const question: TestQuestion = {
    id: input.id ?? uid("q"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...input,
  };
  const exists = data.testQuestions.some((q) => q.id === question.id);
  data.testQuestions = exists
    ? data.testQuestions.map((q) => (q.id === question.id ? { ...q, ...question } : q))
    : [...data.testQuestions, question];
  writeData(data);
  return question;
}

export function removeTestQuestion(questionId: string) {
  const data = readData();
  data.testQuestions = data.testQuestions.filter((q) => q.id !== questionId);
  writeData(data);
}

export function startFinalAttempt(userId: string): FinalAttemptState {
  const data = readData();
  const state: FinalAttemptState = {
    userId,
    startedAt: new Date().toISOString(),
    questionIndex: 0,
    answers: {},
  };
  data.finalAttempt = state;
  writeData(data);
  return state;
}

export function saveFinalAttempt(state: FinalAttemptState) {
  const data = readData();
  data.finalAttempt = state;
  writeData(data);
}

export function getFinalAttempt(userId: string) {
  const data = readData();
  if (data.finalAttempt?.userId === userId) {
    return data.finalAttempt;
  }
  return null;
}

export function completeFinalAttempt(
  userId: string,
  score: number,
  passed: boolean,
  meta?: { questionsTotal: number; questionsCorrect: number },
) {
  const data = readData();
  const result: TestResult = {
    id: uid("t"),
    userId,
    type: "final",
    status: passed ? "passed" : "failed",
    score,
    createdAt: new Date().toISOString(),
    ...(meta
      ? {
          questionsTotal: meta.questionsTotal,
          questionsCorrect: meta.questionsCorrect,
        }
      : {}),
  };
  data.testResults.unshift(result);
  if (data.finalAttempt?.userId === userId) {
    data.finalAttempt = null;
  }
  writeData(data);
}

export function addTrialResult(
  userId: string,
  score: number,
  meta?: { questionsTotal: number; questionsCorrect: number },
) {
  const data = readData();
  data.testResults.unshift({
    id: uid("t"),
    userId,
    type: "trial",
    status: score >= 60 ? "passed" : "failed",
    score,
    createdAt: new Date().toISOString(),
    ...(meta
      ? {
          questionsTotal: meta.questionsTotal,
          questionsCorrect: meta.questionsCorrect,
        }
      : {}),
  });
  writeData(data);
}

export function markFinalAttemptAsFailed(userId: string, meta?: { questionsTotal?: number }) {
  const data = readData();
  if (!data.finalAttempt || data.finalAttempt.userId !== userId) return;
  data.testResults.unshift({
    id: uid("t"),
    userId,
    type: "final",
    status: "failed",
    score: 0,
    createdAt: new Date().toISOString(),
    ...(meta?.questionsTotal != null
      ? {
          questionsTotal: meta.questionsTotal,
          questionsCorrect: 0,
        }
      : {}),
  });
  data.finalAttempt = null;
  writeData(data);
}

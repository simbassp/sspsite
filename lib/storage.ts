"use client";

import { seedData, STORAGE_KEY } from "@/lib/seed";
import {
  AppData,
  FinalAttemptState,
  Position,
  SessionUser,
  TestResult,
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
    return JSON.parse(raw) as AppData;
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
    status: "active",
  };

  data.users.unshift(user);
  writeData(data);
  return { ok: true as const };
}

export function listUsers() {
  return readData().users;
}

export function updateUser(
  userId: string,
  patch: Partial<Pick<UserRecord, "name" | "callsign" | "position" | "status">>,
) {
  const data = readData();
  data.users = data.users.map((user) => (user.id === userId ? { ...user, ...patch } : user));
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

export function addNews(payload: { title: string; body: string; priority: "high" | "normal"; author: string }) {
  const data = readData();
  data.news.unshift({
    id: uid("n"),
    title: payload.title,
    body: payload.body,
    priority: payload.priority,
    author: payload.author,
    createdAt: new Date().toISOString(),
  });
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

export function getUavById(id: string) {
  return readData().uav.find((item) => item.id === id) ?? null;
}

export function listTestResults() {
  return readData().testResults;
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

export function completeFinalAttempt(userId: string, score: number, passed: boolean) {
  const data = readData();
  const result: TestResult = {
    id: uid("t"),
    userId,
    type: "final",
    status: passed ? "passed" : "failed",
    score,
    createdAt: new Date().toISOString(),
  };
  data.testResults.unshift(result);
  if (data.finalAttempt?.userId === userId) {
    data.finalAttempt = null;
  }
  writeData(data);
}

export function addTrialResult(userId: string, score: number) {
  const data = readData();
  data.testResults.unshift({
    id: uid("t"),
    userId,
    type: "trial",
    status: score >= 60 ? "passed" : "failed",
    score,
    createdAt: new Date().toISOString(),
  });
  writeData(data);
}

export function markFinalAttemptAsFailed(userId: string) {
  const data = readData();
  if (!data.finalAttempt || data.finalAttempt.userId !== userId) return;
  data.testResults.unshift({
    id: uid("t"),
    userId,
    type: "final",
    status: "failed",
    score: 0,
    createdAt: new Date().toISOString(),
  });
  data.finalAttempt = null;
  writeData(data);
}

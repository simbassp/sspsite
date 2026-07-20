"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { FINAL_TEST_MAX_ATTEMPTS } from "@/lib/final-test-constants";
import { FINAL_AUTO_RESET_DAY_UTC } from "@/lib/final-effective-counting";
import { formatDateTime } from "@/lib/format";
import {
  beginFinalAttempt,
  createTrialResult,
  fetchActiveQuestionPool,
  fetchTestConfig,
  fetchUserResults,
  finishFinalAttempt,
  forceFailFinalAttempt,
  loadFinalAttempt,
  persistFinalAttempt,
  seedDefaultQuestionsIfEmpty,
} from "@/lib/tests-repository";
import { filterDbPoolByManualTopicSettings } from "@/lib/manual-topic";
import { DEFAULT_TEST_CONFIG } from "@/lib/test-config";
import { formatTestResultDisplay, isFinalPassed } from "@/lib/test-pass-rules";
import { loadRecentQuestionIds, pickTestQuestions, rememberQuestionIds } from "@/lib/test-question-selection";
import { generateUavTtxQuestionBank } from "@/lib/uav-test-generator";
import { fetchUavItems } from "@/lib/uav-repository";
import { TestConfig, TestQuestion, TestResult } from "@/lib/types";

const TRIAL_FEEDBACK_MS = 2600;
const QUESTION_START_COUNTDOWN_SEC = 3;

function formatAttemptDuration(value: number | null | undefined) {
  const sec = Number(value);
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)} сек`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min} мин ${rem} сек` : `${min} мин`;
}

function resolveBankTimeFromQuestions(questions: TestQuestion[]) {
  if (!questions.length) return null;
  const freq = new Map<number, number>();
  for (const q of questions) {
    const sec = Math.max(5, Number(q.timeLimitSec || 10));
    freq.set(sec, (freq.get(sec) || 0) + 1);
  }
  let winner = 10;
  let count = -1;
  for (const [sec, c] of freq.entries()) {
    if (c > count) {
      winner = sec;
      count = c;
    }
  }
  return winner;
}

type TrialFeedback = { chosen: number | null; correct: number };

type FinalReviewItem = {
  questionText: string;
  chosenLabel: string;
  correctLabel: string;
};

type FinalReview = {
  scorePercent: number;
  correctCount: number;
  totalCount: number;
  passed: boolean;
  wrongItems: FinalReviewItem[];
};

function buildFinalReview(questions: TestQuestion[], finalAnswers: Record<string, number>): FinalReview {
  const totalCount = questions.length;
  let correctCount = 0;
  const wrongItems: FinalReviewItem[] = [];

  for (const q of questions) {
    const chosen = finalAnswers[q.id];
    const isCorrect = chosen === q.correctIndex;
    if (isCorrect) {
      correctCount += 1;
      continue;
    }
    const chosenLabel =
      typeof chosen === "number" && chosen >= 0 && q.options[chosen] != null
        ? q.options[chosen]
        : "Не ответил";
    const correctLabel = q.options[q.correctIndex] ?? "—";
    wrongItems.push({
      questionText: q.text,
      chosenLabel,
      correctLabel,
    });
  }

  const scorePercent = Math.round((correctCount / Math.max(totalCount, 1)) * 100);
  return {
    scorePercent,
    correctCount,
    totalCount,
    passed: isFinalPassed(correctCount, totalCount),
    wrongItems,
  };
}

type FinalTestSummary = {
  maxAttempts: number;
  usedAttempts: number;
  hasPassedFinal: boolean;
  canStartFinal: boolean;
  attemptsExhausted: boolean;
  nextAutoResetAt?: string;
};

export default function TestsPage() {
  const session = useMemo(() => readClientSession(), []);
  const [isHydrated, setIsHydrated] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [questionPool, setQuestionPool] = useState<TestQuestion[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<TestQuestion[]>([]);
  const [testConfig, setTestConfig] = useState<TestConfig>(DEFAULT_TEST_CONFIG);
  const [message, setMessage] = useState("");
  const [activeTest, setActiveTest] = useState<"trial" | "final" | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isAnswering, setIsAnswering] = useState(false);
  const [trialFeedback, setTrialFeedback] = useState<TrialFeedback | null>(null);
  const [finalReview, setFinalReview] = useState<FinalReview | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [isTestStarted, setIsTestStarted] = useState(false);
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const [finalTest, setFinalTest] = useState<FinalTestSummary | null>(null);
  const [bankQuestionTimeSec, setBankQuestionTimeSec] = useState<number | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  /** Не оставляем прокрутку «в середину» от предыдущей страницы / восстановления позиции. */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  const isAnsweringRef = useRef(false);
  isAnsweringRef.current = isAnswering;

  /** Один раз на вопрос срабатывает истечение таймера (без «ложного» нуля из старого состояния). */
  const expireHandledForQuestionIdRef = useRef<string | null>(null);
  const answersRef = useRef<Record<string, number>>({});
  const questionIndexRef = useRef(0);
  const activeQuestionsRef = useRef<TestQuestion[]>([]);
  const currentQuestionRef = useRef<TestQuestion | undefined>(undefined);
  const activeTestRef = useRef<"trial" | "final" | null>(null);
  const trialRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTrialAfterRevealRef = useRef<() => void>(() => {});
  const testStartedAtRef = useRef<string | null>(null);
  const testCardRef = useRef<HTMLDivElement | null>(null);
  const finalReviewRef = useRef<HTMLDivElement | null>(null);
  /** Одноразовое уведомление в блоке сообщений при исчерпании попыток итога. */
  const finalAttemptsExhaustedBannerRef = useRef(false);

  answersRef.current = answers;
  questionIndexRef.current = questionIndex;
  activeQuestionsRef.current = selectedQuestions;
  currentQuestionRef.current = selectedQuestions[questionIndex];
  activeTestRef.current = activeTest;

  const reloadFinalSummary = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch("/api/tests/final-summary", { cache: "no-store" });
      const payload = (await res.json()) as { ok?: boolean; finalTest?: FinalTestSummary };
      if (payload.ok && payload.finalTest) {
        setFinalTest(payload.finalTest);
      }
    } catch {
      /* ignore */
    }
  }, [session]);

  useEffect(() => {
    if (!finalTest || finalTest.hasPassedFinal || !finalTest.attemptsExhausted) return;
    if (finalAttemptsExhaustedBannerRef.current) return;
    finalAttemptsExhaustedBannerRef.current = true;
    setMessage((prev) =>
      prev.trim()
        ? prev
        : `Попытки итогового теста израсходованы. Сброс выполняет администратор или автосброс ${FINAL_AUTO_RESET_DAY_UTC}-го числа.`,
    );
  }, [finalTest]);

  const refresh = async () => {
    if (!session) return;
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/tests/history", { cache: "no-store" });
      const payload = (await response.json()) as { ok?: boolean; rows?: Array<Record<string, unknown>> };
      if (process.env.NODE_ENV !== "production") {
        console.debug("[tests] history response", { ok: payload.ok, status: response.status, count: payload.rows?.length || 0 });
      }
      if (!response.ok || !payload.ok || !Array.isArray(payload.rows)) {
        const fallbackRows = await fetchUserResults(session.id);
        setResults(fallbackRows);
        setHistoryError("");
        setIsHistoryLoading(false);
        void reloadFinalSummary();
        return;
      }
      const mapped = payload.rows.map((r) => {
        const n = Number(r.final_attempt_index);
        return {
          id: String(r.id),
          userId: String(r.user_id),
          type: r.type === "final" ? "final" : "trial",
          status: r.status === "passed" ? "passed" : "failed",
          score: Number(r.score || 0),
          createdAt: String(r.created_at),
          durationSeconds: r.duration_seconds != null ? Number(r.duration_seconds) : undefined,
          questionsTotal: r.questions_total != null ? Number(r.questions_total) : undefined,
          questionsCorrect: r.questions_correct != null ? Number(r.questions_correct) : undefined,
          finalAttemptIndex: Number.isFinite(n) && n > 0 ? n : undefined,
        };
      }) as TestResult[];
      setResults(mapped);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[tests] history request failed");
      }
      try {
        const fallbackRows = await fetchUserResults(session.id);
        setResults(fallbackRows);
        setHistoryError("");
      } catch {
        setHistoryError("Не удалось загрузить историю попыток.");
      }
    } finally {
      setIsHistoryLoading(false);
      void reloadFinalSummary();
    }
  };

  const loadQuestionPool = async (): Promise<TestQuestion[] | null> => {
    setIsPoolLoading(true);
    try {
      const response = await fetch("/api/tests/pool", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok?: boolean;
        questionPool?: TestQuestion[];
        uavItems?: unknown[];
        timingsMs?: Record<string, number>;
      };
      if (process.env.NODE_ENV !== "production") {
        console.debug("[tests] pool response", {
          ok: payload.ok,
          status: response.status,
          dbQuestions: payload.questionPool?.length || 0,
          uavItems: payload.uavItems?.length || 0,
          timings: payload.timingsMs || {},
        });
      }
      if (!response.ok || !payload.ok) {
        const [uavItems, dbPool] = await Promise.all([fetchUavItems(), fetchActiveQuestionPool()]);
        const dbPoolFiltered = filterDbPoolByManualTopicSettings(dbPool, testConfig);
        const fromUav = testConfig.uavAutoGeneration
          ? generateUavTtxQuestionBank(uavItems, testConfig.timePerQuestionSec)
          : [];
        if (fromUav.length > 0) {
          const ids = new Set(fromUav.map((q) => q.id));
          const merged = [...fromUav, ...dbPoolFiltered.filter((q) => !ids.has(q.id))];
          setQuestionPool(merged);
          return merged;
        }
        setQuestionPool(dbPoolFiltered);
        return dbPoolFiltered;
      }
      const dbPool = Array.isArray(payload.questionPool) ? payload.questionPool : [];
      const uavItems = Array.isArray(payload.uavItems) ? payload.uavItems : [];
      const fromUav = testConfig.uavAutoGeneration ? generateUavTtxQuestionBank(uavItems as never[], testConfig.timePerQuestionSec) : [];
      if (fromUav.length > 0) {
        const ids = new Set(fromUav.map((q) => q.id));
        const merged = [...fromUav, ...dbPool.filter((q) => !ids.has(q.id))];
        setQuestionPool(merged);
        return merged;
      } else {
        setQuestionPool(dbPool);
        return dbPool;
      }
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[tests] pool request failed");
      }
      try {
        const [uavItems, dbPool] = await Promise.all([fetchUavItems(), fetchActiveQuestionPool()]);
        const dbPoolFiltered = filterDbPoolByManualTopicSettings(dbPool, testConfig);
        const fromUav = testConfig.uavAutoGeneration
          ? generateUavTtxQuestionBank(uavItems, testConfig.timePerQuestionSec)
          : [];
        if (fromUav.length > 0) {
          const ids = new Set(fromUav.map((q) => q.id));
          const merged = [...fromUav, ...dbPoolFiltered.filter((q) => !ids.has(q.id))];
          setQuestionPool(merged);
          return merged;
        }
        setQuestionPool(dbPoolFiltered);
        return dbPoolFiltered;
      } catch {
        return null;
      }
    } finally {
      setIsPoolLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setIsBootstrapping(true);
      setBootstrapError("");
      setIsConfigLoaded(false);
      try {
        const response = await fetch("/api/tests/bootstrap", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          config?: TestConfig;
          hasOrphanAttempt?: boolean;
          bankQuestionTimeSec?: number | null;
          timingsMs?: Record<string, number>;
          finalTest?: FinalTestSummary | null;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "tests_bootstrap_failed");
        }
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          console.debug("[tests] bootstrap timings", payload.timingsMs || {});
        }
        const config = payload.config || DEFAULT_TEST_CONFIG;
        setTestConfig(config);
        setBankQuestionTimeSec(
          Number.isFinite(Number(payload.bankQuestionTimeSec))
            ? Math.max(5, Number(payload.bankQuestionTimeSec))
            : null,
        );
        setIsConfigLoaded(true);
        if (payload.finalTest) {
          setFinalTest(payload.finalTest);
        } else {
          void reloadFinalSummary();
        }

        if (payload.hasOrphanAttempt) {
          try {
            await forceFailFinalAttempt(session.id);
            if (cancelled) return;
            setMessage("Итоговая попытка была прервана (обновление/закрытие/выход) и засчитана как НЕ СДАЛ.");
          } catch {
            if (process.env.NODE_ENV !== "production") {
              console.debug("[tests] orphan attempt resolve failed");
            }
          }
        }
        await refresh();
      } catch (error) {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") {
          console.debug("[tests] bootstrap failed", error);
        }
        try {
          await seedDefaultQuestionsIfEmpty();
          const [uavItems, dbPool, config] = await Promise.all([
            fetchUavItems(),
            fetchActiveQuestionPool(),
            fetchTestConfig(),
          ]);
          if (cancelled) return;
          const dbPoolFiltered = filterDbPoolByManualTopicSettings(dbPool, config);
          setBankQuestionTimeSec(resolveBankTimeFromQuestions(dbPool));
          const fromUav = config.uavAutoGeneration
            ? generateUavTtxQuestionBank(uavItems, config.timePerQuestionSec)
            : [];
          if (fromUav.length > 0) {
            const ids = new Set(fromUav.map((q) => q.id));
            setQuestionPool([...fromUav, ...dbPoolFiltered.filter((q) => !ids.has(q.id))]);
          } else {
            setQuestionPool(dbPoolFiltered);
          }
          setTestConfig(config);
          setIsConfigLoaded(true);

          const orphanAttempt = await loadFinalAttempt(session.id);
          if (cancelled) return;
          if (orphanAttempt) {
            await forceFailFinalAttempt(session.id);
            if (!cancelled) {
              setMessage("Итоговая попытка была прервана (обновление/закрытие/выход) и засчитана как НЕ СДАЛ.");
            }
          }
          setBootstrapError("");
          await refresh();
        } catch {
          if (!cancelled) {
            setBootstrapError("Не удалось загрузить настройки тестов.");
            void refresh();
          }
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, reloadFinalSummary]);

  const activeQuestions = selectedQuestions;
  const currentQuestion = activeQuestions[questionIndex];

  useEffect(() => {
    if (trialRevealTimerRef.current) {
      clearTimeout(trialRevealTimerRef.current);
      trialRevealTimerRef.current = null;
    }
    return () => {
      if (trialRevealTimerRef.current) {
        clearTimeout(trialRevealTimerRef.current);
        trialRevealTimerRef.current = null;
      }
    };
  }, [currentQuestion?.id]);

  /** Прокрутка к блоку вопроса только после старта ответов — не во время отсчёта и не при первом заходе на страницу. */
  useEffect(() => {
    if (!activeTest || !currentQuestion || !isTestStarted || startCountdown != null) return;
    const timer = window.setTimeout(() => {
      testCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTest, currentQuestion?.id, isTestStarted, startCountdown]);

  /** При появлении отсчёта перед стартом вопроса прокручиваем к карточке с таймером (особенно важно на мобильных). */
  useEffect(() => {
    if (!activeTest || !currentQuestion || isTestStarted || startCountdown == null) return;
    const timer = window.setTimeout(() => {
      testCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTest, currentQuestion?.id, isTestStarted, startCountdown]);

  useEffect(() => {
    if (!session || activeTest !== "final") return;
    const onExit = () => void forceFailFinalAttempt(session.id);

    window.addEventListener("beforeunload", onExit);
    window.addEventListener("pagehide", onExit);
    return () => {
      window.removeEventListener("beforeunload", onExit);
      window.removeEventListener("pagehide", onExit);
    };
  }, [activeTest, session]);

  useEffect(() => {
    if (!isTestStarted || !currentQuestion || !activeTest) return;
    expireHandledForQuestionIdRef.current = null;
    setTimeLeft(Math.max(1, currentQuestion.timeLimitSec));
  }, [currentQuestion?.id, activeTest, isTestStarted]);

  useEffect(() => {
    if (!activeTest || !currentQuestion || isTestStarted) return;
    setStartCountdown(QUESTION_START_COUNTDOWN_SEC);
  }, [activeTest, currentQuestion?.id, isTestStarted]);

  useEffect(() => {
    if (startCountdown == null || startCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      if (startCountdown === 1) {
        setStartCountdown(null);
        setIsTestStarted(true);
        if (!testStartedAtRef.current) {
          testStartedAtRef.current = new Date().toISOString();
        }
        setTimeLeft(Math.max(1, currentQuestionRef.current?.timeLimitSec ?? 1));
      } else {
        setStartCountdown((prev) => (prev == null ? null : prev - 1));
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [startCountdown]);

  useEffect(() => {
    if (!isTestStarted || !activeTest || !currentQuestion || trialFeedback) return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        const qNow = currentQuestionRef.current;
        if (!qNow) return prev;
        const qid = qNow.id;

        if (prev <= 0) return 0;
        if (prev <= 1) {
          if (expireHandledForQuestionIdRef.current === qid) return 0;
          expireHandledForQuestionIdRef.current = qid;
          queueMicrotask(() => {
            const at = activeTestRef.current;
            const q = currentQuestionRef.current;
            if (!q || q.id !== qid || !at) return;
            if (at === "trial") {
              setTrialFeedback({ chosen: null, correct: q.correctIndex });
              setAnswers((prevA) => {
                const next = { ...prevA, [q.id]: -1 };
                answersRef.current = next;
                return next;
              });
              if (trialRevealTimerRef.current) clearTimeout(trialRevealTimerRef.current);
              trialRevealTimerRef.current = setTimeout(() => {
                trialRevealTimerRef.current = null;
                completeTrialAfterRevealRef.current();
              }, TRIAL_FEEDBACK_MS);
            } else {
              void submitFinalAnswer(-1);
            }
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeTest, currentQuestion?.id, trialFeedback, isTestStarted]);

  useEffect(() => {
    if (!historyExpanded && historyPage !== 1) setHistoryPage(1);
    const historyVisibleCount = historyExpanded ? results.length : Math.min(results.length, 5);
    const nextPages = historyExpanded ? Math.max(1, Math.ceil(historyVisibleCount / 10)) : 1;
    if (historyExpanded && historyPage > nextPages) setHistoryPage(nextPages);
  }, [historyExpanded, historyPage, results.length]);

  useEffect(() => {
    if (!finalReview) return;
    finalReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [finalReview]);

  if (!isHydrated) {
    return <p className="page-subtitle">Загрузка тестов...</p>;
  }

  if (!session) {
    return <p className="page-subtitle">Ошибка сессии. Перезайдите в систему.</p>;
  }

  async function finishAttempt(type: "trial" | "final", finalAnswers: Record<string, number>) {
    if (!session) return;
    const questions = activeQuestionsRef.current;
    const correct = questions.reduce((acc, q) => acc + (finalAnswers[q.id] === q.correctIndex ? 1 : 0), 0);
    const qTotal = questions.length;
    const score = Math.round((correct / Math.max(qTotal, 1)) * 100);
    const passed = type === "final" ? isFinalPassed(correct, qTotal) : false;
    const reviewSnapshot = type === "final" ? buildFinalReview(questions, finalAnswers) : null;
    const messageText =
      type === "trial"
        ? `Пробный тест завершен: ${formatTestResultDisplay({ questionsCorrect: correct, questionsTotal: qTotal, scorePercent: score })}.`
        : `Итоговый тест завершен: ${formatTestResultDisplay({ questionsCorrect: correct, questionsTotal: qTotal, scorePercent: score })}. Статус: ${
            passed ? "СДАЛ" : "НЕ СДАЛ"
          }.`;

    if (reviewSnapshot) {
      setFinalReview(reviewSnapshot);
    }

    // Снимаем активный тест сразу, чтобы не было повторной обработки последнего вопроса.
    setActiveTest(null);
    activeTestRef.current = null;
    setQuestionIndex(0);
    questionIndexRef.current = 0;
    setAnswers({});
    answersRef.current = {};
    setSelectedQuestions([]);
    activeQuestionsRef.current = [];
    currentQuestionRef.current = undefined;
    setTimeLeft(0);
    setTrialFeedback(null);
    setIsTestStarted(false);
    setIsAnswering(false);
    if (trialRevealTimerRef.current) {
      clearTimeout(trialRevealTimerRef.current);
      trialRevealTimerRef.current = null;
    }

    const nowIso = new Date().toISOString();
    const startedAt = testStartedAtRef.current;
    const durationSeconds =
      startedAt != null
        ? Math.max(1, Math.round((new Date(nowIso).getTime() - new Date(startedAt).getTime()) / 1000))
        : undefined;
    const meta = {
      questionsTotal: qTotal,
      questionsCorrect: correct,
      startedAt: startedAt || undefined,
      finishedAt: nowIso,
      durationSeconds,
    };
    try {
      if (type === "trial") {
        await createTrialResult(session.id, score, meta);
      } else {
        await finishFinalAttempt(session.id, score, passed, meta);
      }
      setMessage(messageText);
    } catch {
      setMessage(messageText);
    } finally {
      testStartedAtRef.current = null;
      await refresh();
    }
  }

  function completeTrialAfterReveal() {
    setTrialFeedback(null);
    const idx = questionIndexRef.current;
    const list = activeQuestionsRef.current;
    const nextAnswers = answersRef.current;
    if (!list.length) {
      setIsAnswering(false);
      return;
    }
    if (idx >= list.length - 1) {
      void finishAttempt("trial", nextAnswers);
      setIsAnswering(false);
      return;
    }
    setQuestionIndex(idx + 1);
    if (trialRevealTimerRef.current) {
      clearTimeout(trialRevealTimerRef.current);
      trialRevealTimerRef.current = null;
    }
    setIsAnswering(false);
  }

  completeTrialAfterRevealRef.current = completeTrialAfterReveal;

  const submitFinalAnswer = async (optionIndex: number) => {
    const at = activeTestRef.current;
    const q = currentQuestionRef.current;
    const idx = questionIndexRef.current;
    const list = activeQuestionsRef.current;
    if (!isTestStarted || !at || at !== "final" || !q || isAnsweringRef.current) return;
    setIsAnswering(true);
    const nextAnswers = { ...answersRef.current, [q.id]: optionIndex };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);

    if (idx < list.length - 1) {
      const nextIndex = idx + 1;
      setQuestionIndex(nextIndex);
      await persistFinalAttempt({
        userId: session!.id,
        startedAt: new Date().toISOString(),
        questionIndex: nextIndex,
        answers: Object.fromEntries(Object.entries(nextAnswers).map(([k, v]) => [k, String(v)])),
      });
      setIsAnswering(false);
      return;
    }

    await finishAttempt("final", nextAnswers);
    setIsAnswering(false);
  };

  const onTrialOptionClick = (optionIndex: number) => {
    const q = currentQuestionRef.current;
    if (!isTestStarted || !q || activeTestRef.current !== "trial" || trialFeedback || isAnswering) return;
    setIsAnswering(true);
    setTrialFeedback({ chosen: optionIndex, correct: q.correctIndex });
    const nextAnswers = { ...answersRef.current, [q.id]: optionIndex };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    if (trialRevealTimerRef.current) clearTimeout(trialRevealTimerRef.current);
    trialRevealTimerRef.current = setTimeout(() => {
      trialRevealTimerRef.current = null;
      completeTrialAfterRevealRef.current();
    }, TRIAL_FEEDBACK_MS);
  };

  const onTrial = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const pool = await loadQuestionPool();
    if (!pool) {
      setMessage("Не удалось подготовить вопросы. Проверьте интернет.");
      return;
    }
    if (pool.length === 0) {
      setMessage(
        testConfig.uavAutoGeneration
          ? "Нет карточек БПЛА с ТТХ и нет активных вопросов в банке. Заполните справочник БПЛА или добавьте вопросы в админке."
          : "Нет активных вопросов в банке. Добавьте их в разделе «Админ / Тесты».",
      );
      return;
    }
    const recentIds = session ? loadRecentQuestionIds(session.id) : [];
    const randomQuestions = pickTestQuestions(pool, testConfig.trialQuestionCount, recentIds);
    if (session) rememberQuestionIds(session.id, randomQuestions.map((q) => q.id));
    const first = randomQuestions[0];
    expireHandledForQuestionIdRef.current = null;
    setTrialFeedback(null);
    setFinalReview(null);
    setActiveTest("trial");
    setIsTestStarted(false);
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    if (first) setTimeLeft(Math.max(1, first.timeLimitSec));
    testStartedAtRef.current = null;
    setMessage(`Пробный тест запущен: ${randomQuestions.length} случайных вопросов.`);
  };

  const startFinal = async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (finalTest && !finalTest.canStartFinal) {
      setMessage(
        `Итоговый тест недоступен: попытки израсходованы. Сброс выполняет администратор или автосброс ${FINAL_AUTO_RESET_DAY_UTC}-го числа.`,
      );
      return;
    }
    const remainingAttempts = finalTest
      ? Math.max(0, finalTest.maxAttempts - finalTest.usedAttempts)
      : FINAL_TEST_MAX_ATTEMPTS;
    const passedHint = finalTest?.hasPassedFinal ? "\n\nИтоговый тест уже сдан в этом месяце, но оставшиеся попытки можно использовать для тренировки." : "";
    const confirmed = window.confirm(
      `Запустить итоговый тест?\n\nСтрогий режим: время на каждый вопрос ограничено, подсказок нет.\nБудет использована 1 попытка (осталось ${remainingAttempts} из ${finalTest?.maxAttempts ?? FINAL_TEST_MAX_ATTEMPTS}).\n\nСлучайное нажатие тоже засчитывается как попытка.${passedHint}`,
    );
    if (!confirmed) return;
    const pool = await loadQuestionPool();
    if (!pool) {
      setMessage("Не удалось подготовить вопросы. Проверьте интернет.");
      return;
    }
    if (pool.length === 0) {
      setMessage(
        testConfig.uavAutoGeneration
          ? "Нет карточек БПЛА с ТТХ и нет активных вопросов в банке. Заполните справочник БПЛА или добавьте вопросы в админке."
          : "Нет активных вопросов в банке. Добавьте их в разделе «Админ / Тесты».",
      );
      return;
    }
    const recentIds = session ? loadRecentQuestionIds(session.id) : [];
    const randomQuestions = pickTestQuestions(pool, testConfig.finalQuestionCount, recentIds);
    if (session) rememberQuestionIds(session.id, randomQuestions.map((q) => q.id));
    const first = randomQuestions[0];
    await beginFinalAttempt(session.id);
    expireHandledForQuestionIdRef.current = null;
    setTrialFeedback(null);
    setFinalReview(null);
    setActiveTest("final");
    setIsTestStarted(false);
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    if (first) setTimeLeft(Math.max(1, first.timeLimitSec));
    testStartedAtRef.current = null;
    setMessage(`Итоговый тест запущен: ${randomQuestions.length} случайных вопросов. Режим строгий.`);
  };

  const getTrialOptionState = (index: number) => {
    if (activeTest !== "trial" || !trialFeedback) return "neutral";
    const { chosen, correct } = trialFeedback;
    if (index === correct) return "correct";
    if (chosen !== null && index === chosen && chosen !== correct) return "wrong";
    return "neutral";
  };

  const optionLetter = (index: number) => String.fromCharCode(65 + index);
  const timerRatio =
    currentQuestion && currentQuestion.timeLimitSec > 0 ? Math.max(0, Math.min(1, timeLeft / currentQuestion.timeLimitSec)) : 0;
  const timerHue = Math.round(120 * timerRatio);
  const timerColor = `hsl(${timerHue}, 70%, 45%)`;
  const nextAutoResetText =
    finalTest?.nextAutoResetAt
      ? formatDateTime(finalTest.nextAutoResetAt)
      : `${FINAL_AUTO_RESET_DAY_UTC} числа следующего месяца`;
  const finalStatusText =
    finalTest == null
      ? "—"
      : finalTest.attemptsExhausted
        ? finalTest.hasPassedFinal
          ? "Сдан"
          : "Ограничено"
        : finalTest.hasPassedFinal
          ? "Сдан · есть попытки"
          : "Доступен";
  const historyPageSize = 10;
  const historyVisible = historyExpanded ? results : results.slice(0, 5);
  const historyPages = historyExpanded ? Math.max(1, Math.ceil(historyVisible.length / historyPageSize)) : 1;
  const safeHistoryPage = Math.min(historyPage, historyPages);
  const pagedHistory = historyExpanded
    ? historyVisible.slice((safeHistoryPage - 1) * historyPageSize, safeHistoryPage * historyPageSize)
    : historyVisible;

  return (
    <section className="tests-page">
      <h1 className="page-title" style={{ marginBottom: 6 }}>
        Тестирование
      </h1>
      <p className="page-subtitle" style={{ marginBottom: 12 }}>
        Доступно два типа тестов: пробный для практики и итоговый для проверки знаний.
      </p>

      <div className="tests-ref-info">
        <div className="tests-ref-info__left">
          <span className="tests-ref-info__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div>
            <p>При запуске итогового теста вопросы всегда разные, время ответа ограничено.</p>
            <p>При исчерпании попыток доступ будет заблокирован до ручного или автоматического сброса.</p>
          </div>
        </div>
        <div className="tests-ref-info__right">
          <span className="tests-ref-info__calendar" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3 10h18" />
              <path d="M13 15l2 2 4-4" />
            </svg>
          </span>
          <div>
            <p>Следующий автосброс:</p>
            <strong>{nextAutoResetText}</strong>
          </div>
        </div>
      </div>

      <section className="card tests-ref-shell" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3 style={{ marginBottom: 12 }}>Выберите тест</h3>
          <div className="tests-ref-grid">
            <article className="tests-ref-test-card">
              <div className="tests-ref-test-card__head">
                <span className="tests-ref-test-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4" />
                    <path d="M4 3h8a2 2 0 0 1 2 2v4H6a2 2 0 0 0-2 2V3Z" />
                    <path d="M9 14l7-7 2 2-7 7-3 1 1-3Z" />
                  </svg>
                </span>
                <div>
                  <h4>Пробный тест</h4>
                  <span className="tests-ref-chip tests-ref-chip--neutral">Без штрафов</span>
                </div>
              </div>
              <p>Без ограничений по времени и попыткам. Подсветка верного варианта после ответа.</p>
              <button
                className="btn tests-ref-btn-outline"
                type="button"
                onClick={onTrial}
                disabled={isBootstrapping || isPoolLoading || !isConfigLoaded}
              >
                Начать пробный тест
              </button>
            </article>

            <article className="tests-ref-test-card">
              <div className="tests-ref-test-card__head">
                <span className="tests-ref-test-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="6" width="14" height="14" rx="2" />
                    <path d="M9 6V4a3 3 0 0 1 6 0v2" />
                    <circle cx="12" cy="13" r="2.2" />
                    <path d="M12 15.2v2.3" />
                  </svg>
                </span>
                <div>
                  <h4>Итоговый тест</h4>
                  <span className="tests-ref-chip tests-ref-chip--danger">Ограничено</span>
                </div>
              </div>
              <p>Ограничение по времени и количеству попыток. Результат засчитывается в систему.</p>
              {activeTest !== "final" && (
                <button
                  className="btn btn-primary tests-ref-btn-solid"
                  type="button"
                  onClick={startFinal}
                  disabled={
                    isBootstrapping ||
                    isPoolLoading ||
                    !isConfigLoaded ||
                    finalTest == null ||
                    !finalTest.canStartFinal
                  }
                  title={
                    finalTest != null && finalTest.attemptsExhausted
                      ? `Попытки итогового теста израсходованы. Нужен ручной или автоматический сброс (${FINAL_AUTO_RESET_DAY_UTC}-е число).`
                      : finalTest != null && !finalTest.canStartFinal
                        ? "Сейчас нельзя начать итоговый тест."
                        : undefined
                  }
                >
                  Начать итоговый тест
                </button>
              )}
            </article>
          </div>

          <div className="tests-ref-metrics">
            <div className="tests-ref-metric">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <div>
                <p>Попытки (итоговый тест)</p>
                <strong>
                  {finalTest?.usedAttempts ?? 0} / {FINAL_TEST_MAX_ATTEMPTS}
                </strong>
              </div>
            </div>
            <div className="tests-ref-metric">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <div>
                <p>Доступно время</p>
                <strong>{Math.max(5, Number(bankQuestionTimeSec ?? 10))} сек</strong>
              </div>
            </div>
            <div className="tests-ref-metric">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <div>
                <p>Статус</p>
                <strong>{finalStatusText}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {isBootstrapping && <p className="page-subtitle" style={{ marginTop: 10 }}>Загрузка тестовых данных...</p>}
      {!isBootstrapping && !!bootstrapError && <p className="page-subtitle">{bootstrapError}</p>}
      {isPoolLoading && <p className="page-subtitle">Подготавливаем вопросы для запуска теста...</p>}

      {activeTest && currentQuestion && (
        <article className="card" style={{ marginTop: 12 }} ref={testCardRef}>
          <div className="card-body">
            <p className="label">
              {activeTest === "final" ? "Итоговый" : "Пробный"} вопрос {questionIndex + 1} / {activeQuestions.length}
            </p>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              {!isTestStarted && startCountdown != null ? (
                <>Начинаем через {startCountdown} с…</>
              ) : activeTest === "trial" && trialFeedback ? (
                <>
                  {trialFeedback.chosen === null
                    ? "Время вышло. Правильный ответ подсвечен."
                    : trialFeedback.chosen === trialFeedback.correct
                      ? "Верно. Правильный ответ подсвечен."
                      : "Неверно. Ваш вариант — красным, правильный — зелёным."}{" "}
                  Следующий вопрос через {Math.ceil(TRIAL_FEEDBACK_MS / 1000)} с…
                </>
              ) : (
                <>Осталось времени на ответ:</>
              )}
            </p>
            {isTestStarted ? (
              <>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 4,
                    marginBottom: 10,
                    padding: "7px 12px",
                    borderRadius: 999,
                    backgroundColor: `color-mix(in srgb, ${timerColor} 16%, var(--panel))`,
                    border: `1px solid color-mix(in srgb, ${timerColor} 60%, transparent)`,
                    color: timerColor,
                    transition: "all .35s ease",
                  }}
                >
                  <strong style={{ minWidth: 22, textAlign: "right" }}>{timeLeft}</strong>
                  <span>секунд</span>
                </div>
                <h3 style={{ marginTop: 8 }}>{currentQuestion.text}</h3>
                <div className="form" style={{ marginTop: 10 }}>
                  {currentQuestion.options.map((option, index) => (
                    <button
                      className={`btn test-option-btn ${activeTest === "trial" && trialFeedback ? "test-option-btn--trial-reveal" : ""}`}
                      type="button"
                      key={`${currentQuestion.id}-${index}-${option}`}
                      disabled={(activeTest === "trial" && !!trialFeedback) || (activeTest === "final" && isAnswering)}
                      onClick={() => {
                        if (activeTest === "trial") void onTrialOptionClick(index);
                        else void submitFinalAnswer(index);
                      }}
                    >
                      <span className={`test-option-letter test-option-letter--${getTrialOptionState(index)}`}>{optionLetter(index)}</span>
                      <span>{option}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="page-subtitle" style={{ marginTop: 8 }}>
                Готовим вопрос…
              </p>
            )}
          </div>
        </article>
      )}

      {message && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <p>{message}</p>
          </div>
        </article>
      )}

      {finalReview && (
        <article className="card final-review-card" style={{ marginTop: 12 }} ref={finalReviewRef}>
          <div className="card-body">
            <h3 style={{ marginTop: 0 }}>Разбор итогового теста</h3>
            <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
              Результат:{" "}
              {formatTestResultDisplay({
                questionsCorrect: finalReview.correctCount,
                questionsTotal: finalReview.totalCount,
                scorePercent: finalReview.scorePercent,
              })}
              {" · "}
              <span className={`pill ${finalReview.passed ? "pill-green" : "pill-red"}`}>
                {finalReview.passed ? "Сдал" : "Не сдал"}
              </span>
            </p>
            {finalReview.wrongItems.length === 0 ? (
              <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 0 }}>
                Все ответы верны.
              </p>
            ) : (
              <>
                <p className="page-subtitle" style={{ marginTop: 12, marginBottom: 8 }}>
                  Неверные ответы ({finalReview.wrongItems.length}):
                </p>
                <div className="final-review-list">
                  {finalReview.wrongItems.map((item, index) => (
                    <article className="final-review-item" key={`${index}-${item.questionText.slice(0, 40)}`}>
                      <p className="final-review-question">
                        <span className="final-review-num">{index + 1}.</span> {item.questionText}
                      </p>
                      <p className="final-review-answer final-review-answer--wrong">
                        <span className="test-option-letter test-option-letter--wrong" aria-hidden="true">
                          ✕
                        </span>
                        Ваш ответ: {item.chosenLabel}
                      </p>
                      <p className="final-review-answer final-review-answer--correct">
                        <span className="test-option-letter test-option-letter--correct" aria-hidden="true">
                          ✓
                        </span>
                        Правильный ответ: {item.correctLabel}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
            <button className="btn btn-primary" type="button" style={{ marginTop: 14 }} onClick={() => setFinalReview(null)}>
              Закрыть разбор
            </button>
          </div>
        </article>
      )}

      <section className="card tests-ref-history" style={{ marginTop: 14 }} id="tests-history">
        <div className="card-body">
          <div className="tests-ref-history__head">
            <h3 style={{ margin: 0 }}>История попыток</h3>
            <button className="btn tests-ref-history__btn" type="button" onClick={() => setHistoryExpanded((v) => !v)}>
              {historyExpanded ? "Скрыть" : "Смотреть все"}
            </button>
          </div>
          <div className="tests-ref-table-wrap">
            <table className="tests-ref-table">
              <thead>
                <tr>
                  <th>Тест</th>
                  <th>Результат</th>
                  <th>Баллы</th>
                  <th>Время</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((result) => {
                  const defaultTotal =
                    result.type === "final" ? testConfig.finalQuestionCount : testConfig.trialQuestionCount;
                  const rawTotal = result.questionsTotal;
                  const total = rawTotal != null && Number.isFinite(rawTotal) ? rawTotal : defaultTotal;
                  const rawCorr = result.questionsCorrect;
                  const correct =
                    rawCorr != null && Number.isFinite(rawCorr)
                      ? rawCorr
                      : Math.round((result.score / 100) * Math.max(total, 1));
                  const passed = result.status === "passed";
                  return (
                    <tr key={result.id}>
                      <td>
                        <span className="tests-ref-type">
                          <span className="tests-ref-type__icon" aria-hidden="true">
                            {result.type === "final" ? (
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="5" y="6" width="14" height="14" rx="2" />
                                <path d="M9 6V4a3 3 0 0 1 6 0v2" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4" />
                                <path d="M4 3h8a2 2 0 0 1 2 2v4H6a2 2 0 0 0-2 2V3Z" />
                              </svg>
                            )}
                          </span>
                          {result.type === "final" ? "Итоговый тест" : "Пробный тест"}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${passed ? "pill-green" : "pill-red"}`}>{passed ? "Сдал" : "Не сдал"}</span>
                      </td>
                      <td>
                        {formatTestResultDisplay({
                          questionsCorrect: correct,
                          questionsTotal: total,
                          scorePercent: result.score,
                        })}
                      </td>
                      <td>{formatAttemptDuration(result.durationSeconds)}</td>
                      <td>{formatDateTime(result.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {historyExpanded && historyPages > 1 ? (
            <div className="tests-ref-pager">
              <button className="btn" type="button" disabled={safeHistoryPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                ‹
              </button>
              <span>{safeHistoryPage} / {historyPages}</span>
              <button className="btn" type="button" disabled={safeHistoryPage >= historyPages} onClick={() => setHistoryPage((p) => Math.min(historyPages, p + 1))}>
                ›
              </button>
            </div>
          ) : null}

          <div className="list tests-history" id="tests-history-list-mobile">
            {pagedHistory.map((result) => {
            const defaultTotal =
              result.type === "final" ? testConfig.finalQuestionCount : testConfig.trialQuestionCount;
            const rawTotal = result.questionsTotal;
            const total = rawTotal != null && Number.isFinite(rawTotal) ? rawTotal : defaultTotal;
            const rawCorr = result.questionsCorrect;
            const correct =
              rawCorr != null && Number.isFinite(rawCorr)
                ? rawCorr
                : Math.round((result.score / 100) * Math.max(total, 1));
            const attemptMax = FINAL_TEST_MAX_ATTEMPTS;
            const attemptIdx = result.finalAttemptIndex;
            const passed = result.status === "passed";
            return (
              <article
                className={`card tests-history-card tests-history-card--${passed ? "passed" : "failed"}`}
                key={result.id}
              >
                <div className="card-body">
                  <h3 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span className="tests-ref-type">
                      <span className="tests-ref-type__icon" aria-hidden="true">
                        {result.type === "final" ? (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="5" y="6" width="14" height="14" rx="2" />
                            <path d="M9 6V4a3 3 0 0 1 6 0v2" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-4" />
                            <path d="M4 3h8a2 2 0 0 1 2 2v4H6a2 2 0 0 0-2 2V3Z" />
                          </svg>
                        )}
                      </span>
                      {result.type === "final" ? "Итоговый тест" : "Пробный тест"}
                    </span>{" "}
                    <span className={`pill ${passed ? "pill-green" : "pill-red"}`}>
                      {passed ? "Сдал" : "Не сдал"}
                    </span>
                  </h3>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                    Результат:{" "}
                    {formatTestResultDisplay({
                      questionsCorrect: correct,
                      questionsTotal: total,
                      scorePercent: result.score,
                    })}
                  </p>
                  {result.type === "final" && attemptIdx != null && (
                    <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                      <span className={`pill ${passed ? "pill-green" : "pill-red"}`} style={{ fontSize: 11 }}>
                        Попытка {attemptIdx} / {attemptMax}
                      </span>
                    </p>
                  )}
                  <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                    {formatDateTime(result.createdAt)}
                  </p>
                  <p className="page-subtitle" style={{ marginTop: 6, marginBottom: 0 }}>
                    Время: {formatAttemptDuration(result.durationSeconds)}
                  </p>
                </div>
              </article>
            );
          })}
          {historyExpanded && historyPages > 1 ? (
            <div className="tests-ref-pager">
              <button className="btn" type="button" disabled={safeHistoryPage <= 1} onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}>
                ‹
              </button>
              <span>{safeHistoryPage} / {historyPages}</span>
              <button className="btn" type="button" disabled={safeHistoryPage >= historyPages} onClick={() => setHistoryPage((p) => Math.min(historyPages, p + 1))}>
                ›
              </button>
            </div>
          ) : null}
          {isHistoryLoading && <p className="page-subtitle">Загрузка истории попыток...</p>}
          {!isHistoryLoading && !!historyError && <p className="page-subtitle">{historyError}</p>}
          {!isHistoryLoading && !historyError && !results.length && <p className="page-subtitle">Попыток пока нет.</p>}
          </div>
        </div>
      </section>
    </section>
  );
}

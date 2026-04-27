"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
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
import { DEFAULT_TEST_CONFIG } from "@/lib/test-config";
import { generateUavTtxQuestionBank } from "@/lib/uav-test-generator";
import { fetchUavItems } from "@/lib/uav-repository";
import { TestConfig, TestQuestion, TestResult } from "@/lib/types";

const TRIAL_FEEDBACK_MS = 2600;

function pickRandomQuestions(bank: TestQuestion[], count: number) {
  const cloned = [...bank];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned.slice(0, Math.max(1, Math.min(count, cloned.length)));
}

function applySessionTimeLimits(questions: TestQuestion[], sec: number): TestQuestion[] {
  const t = Math.max(5, Math.floor(sec));
  return questions.map((q) => ({ ...q, timeLimitSec: t }));
}

type TrialFeedback = { chosen: number | null; correct: number };

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
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [isPoolLoading, setIsPoolLoading] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
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

  answersRef.current = answers;
  questionIndexRef.current = questionIndex;
  activeQuestionsRef.current = selectedQuestions;
  currentQuestionRef.current = selectedQuestions[questionIndex];
  activeTestRef.current = activeTest;

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
        return;
      }
      const mapped = payload.rows.map((r) => ({
        id: String(r.id),
        userId: String(r.user_id),
        type: r.type === "final" ? "final" : "trial",
        status: r.status === "passed" ? "passed" : "failed",
        score: Number(r.score || 0),
        createdAt: String(r.created_at),
      })) as TestResult[];
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
    }
  };

  const ensureQuestionPoolLoaded = async (): Promise<TestQuestion[] | null> => {
    if (questionPool.length > 0) return questionPool;
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
        const fromUav = testConfig.uavAutoGeneration
          ? generateUavTtxQuestionBank(uavItems, testConfig.timePerQuestionSec)
          : [];
        if (fromUav.length > 0) {
          const ids = new Set(fromUav.map((q) => q.id));
          const merged = [...fromUav, ...dbPool.filter((q) => !ids.has(q.id))];
          setQuestionPool(merged);
          return merged;
        }
        setQuestionPool(dbPool);
        return dbPool;
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
        const fromUav = testConfig.uavAutoGeneration
          ? generateUavTtxQuestionBank(uavItems, testConfig.timePerQuestionSec)
          : [];
        if (fromUav.length > 0) {
          const ids = new Set(fromUav.map((q) => q.id));
          const merged = [...fromUav, ...dbPool.filter((q) => !ids.has(q.id))];
          setQuestionPool(merged);
          return merged;
        }
        setQuestionPool(dbPool);
        return dbPool;
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
          timingsMs?: Record<string, number>;
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
        setIsConfigLoaded(true);

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
        void refresh();
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
          const fromUav = config.uavAutoGeneration
            ? generateUavTtxQuestionBank(uavItems, config.timePerQuestionSec)
            : [];
          if (fromUav.length > 0) {
            const ids = new Set(fromUav.map((q) => q.id));
            setQuestionPool([...fromUav, ...dbPool.filter((q) => !ids.has(q.id))]);
          } else {
            setQuestionPool(dbPool);
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
  }, [session]);

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
    if (!currentQuestion || !activeTest) return;
    expireHandledForQuestionIdRef.current = null;
    setTimeLeft(Math.max(1, currentQuestion.timeLimitSec));
  }, [currentQuestion?.id, activeTest]);

  useEffect(() => {
    if (!activeTest || !currentQuestion || trialFeedback) return;
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
  }, [activeTest, currentQuestion?.id, trialFeedback]);

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
    const score = Math.round((correct / Math.max(questions.length, 1)) * 100);

    if (type === "trial") {
      await createTrialResult(session.id, score);
      setMessage(`Пробный тест завершен: ${score}%.`);
    } else {
      const passed = score >= 80;
      await finishFinalAttempt(session.id, score, passed);
      setMessage(`Итоговый тест завершен: ${score}%. Статус: ${passed ? "СДАЛ" : "НЕ СДАЛ"}.`);
    }

    setActiveTest(null);
    setQuestionIndex(0);
    setAnswers({});
    setSelectedQuestions([]);
    setTimeLeft(0);
    setTrialFeedback(null);
    setIsAnswering(false);
    await refresh();
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
    if (!at || at !== "final" || !q || isAnsweringRef.current) return;
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
    if (!q || activeTestRef.current !== "trial" || trialFeedback || isAnswering) return;
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
    const pool = await ensureQuestionPoolLoaded();
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
    const randomQuestions = applySessionTimeLimits(
      pickRandomQuestions(pool, testConfig.trialQuestionCount),
      testConfig.timePerQuestionSec,
    );
    const first = randomQuestions[0];
    expireHandledForQuestionIdRef.current = null;
    setTrialFeedback(null);
    setActiveTest("trial");
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    if (first) setTimeLeft(Math.max(1, first.timeLimitSec));
    setMessage(`Пробный тест запущен: ${randomQuestions.length} случайных вопросов.`);
  };

  const startFinal = async () => {
    const pool = await ensureQuestionPoolLoaded();
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
    const randomQuestions = applySessionTimeLimits(
      pickRandomQuestions(pool, testConfig.finalQuestionCount),
      testConfig.timePerQuestionSec,
    );
    const first = randomQuestions[0];
    await beginFinalAttempt(session.id);
    expireHandledForQuestionIdRef.current = null;
    setTrialFeedback(null);
    setActiveTest("final");
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    if (first) setTimeLeft(Math.max(1, first.timeLimitSec));
    setMessage(`Итоговый тест запущен: ${randomQuestions.length} случайных вопросов. Режим строгий.`);
  };

  const trialOptionClassName = (index: number) => {
    if (activeTest !== "trial" || !trialFeedback) return "btn";
    const { chosen, correct } = trialFeedback;
    if (index === correct) return "btn trial-feedback-btn--correct";
    if (chosen !== null && index === chosen && chosen !== correct) return "btn trial-feedback-btn--wrong";
    return "btn trial-feedback-btn--dim";
  };

  return (
    <section className="tests-page">
      <div className="tests-page-head">
        <h1 className="page-title">Тестирование</h1>
        <p className="page-subtitle">
          {testConfig.uavAutoGeneration
            ? "В тест попадают вопросы из ТТХ карточек БПЛА и активные вопросы из банка администратора."
            : "Используются только вопросы из банка в «Админ / Тесты»."}{" "}
          Случайная выборка. На каждый вопрос — <strong>{testConfig.timePerQuestionSec}</strong> сек (задаётся в админке).
        </p>
      </div>

      {isBootstrapping && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <p className="page-subtitle">Загрузка тестовых данных...</p>
          </div>
        </article>
      )}
      {!isBootstrapping && !!bootstrapError && <p className="page-subtitle">{bootstrapError}</p>}
      {isPoolLoading && <p className="page-subtitle">Подготавливаем вопросы для запуска теста...</p>}

      <div className="tests-page-main">
      <div className="grid grid-two">
        <article className="card">
          <div className="card-body">
            <h3>Пробный тест</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Без штрафов за выход. Можно проходить многократно. После ответа или истечения времени показывается подсветка
              верного варианта.
            </p>
            <button className="btn btn-primary" type="button" onClick={onTrial} disabled={isBootstrapping || isPoolLoading || !isConfigLoaded}>
              Начать пробный тест
            </button>
          </div>
        </article>
        <article className="card">
          <div className="card-body">
            <h3>Итоговый тест</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              При обновлении страницы, закрытии вкладки или выходе попытка засчитывается как не сдал.
            </p>
            {activeTest !== "final" && (
              <button className="btn btn-primary" type="button" onClick={startFinal} disabled={isBootstrapping || isPoolLoading || !isConfigLoaded}>
                Начать итоговый тест
              </button>
            )}
          </div>
        </article>
      </div>

      {activeTest && currentQuestion && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <p className="label">
              {activeTest === "final" ? "Итоговый" : "Пробный"} вопрос {questionIndex + 1} / {activeQuestions.length}
            </p>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              {activeTest === "trial" && trialFeedback ? (
                <>
                  {trialFeedback.chosen === null
                    ? "Время вышло. Правильный ответ подсвечен."
                    : trialFeedback.chosen === trialFeedback.correct
                      ? "Верно. Правильный ответ подсвечен."
                      : "Неверно. Ваш вариант — красным, правильный — зелёным."}{" "}
                  Следующий вопрос через {Math.ceil(TRIAL_FEEDBACK_MS / 1000)} с…
                </>
              ) : (
                <>
                  Осталось времени: <strong>{timeLeft}</strong> сек
                </>
              )}
            </p>
            <h3 style={{ marginTop: 8 }}>{currentQuestion.text}</h3>
            <div className="form" style={{ marginTop: 10 }}>
              {currentQuestion.options.map((option, index) => (
                <button
                  className={trialOptionClassName(index)}
                  type="button"
                  key={`${currentQuestion.id}-${index}-${option}`}
                  disabled={(activeTest === "trial" && !!trialFeedback) || (activeTest === "final" && isAnswering)}
                  onClick={() => {
                    if (activeTest === "trial") void onTrialOptionClick(index);
                    else void submitFinalAnswer(index);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>
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
      </div>

      <div className="tests-history-section" id="tests-history">
        <h2 className="page-title tests-history tests-history-title">
          История попыток
        </h2>
        <div className="list tests-history">
          {results.map((result) => (
            <article className="card" key={result.id}>
              <div className="card-body">
                <h3>{result.type === "final" ? "Итоговый" : "Пробный"} тест</h3>
                <div className="meta" style={{ marginTop: 8 }}>
                  <span className={`pill ${result.status === "passed" ? "pill-green" : "pill-red"}`}>
                    {result.status === "passed" ? "Сдал" : "Не сдал"}
                  </span>
                  <span>Результат: {result.score}%</span>
                  <span>{formatDate(result.createdAt)}</span>
                </div>
              </div>
            </article>
          ))}
          {isHistoryLoading && <p className="page-subtitle">Загрузка истории попыток...</p>}
          {!isHistoryLoading && !!historyError && <p className="page-subtitle">{historyError}</p>}
          {!isHistoryLoading && !historyError && !results.length && <p className="page-subtitle">Попыток пока нет.</p>}
        </div>
      </div>
    </section>
  );
}

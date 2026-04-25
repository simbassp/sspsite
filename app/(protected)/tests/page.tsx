"use client";

import type { CSSProperties } from "react";
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

  const isAnsweringRef = useRef(false);
  isAnsweringRef.current = isAnswering;

  const ignoreZeroTimeLeftOnceRef = useRef(false);
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
    const all = await fetchUserResults(session.id);
    setResults(all);
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      await seedDefaultQuestionsIfEmpty();
      const [uavItems, dbPool, config] = await Promise.all([
        fetchUavItems(),
        fetchActiveQuestionPool(),
        fetchTestConfig(),
      ]);
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

      const orphanAttempt = await loadFinalAttempt(session.id);
      if (orphanAttempt) {
        await forceFailFinalAttempt(session.id);
        setMessage("Итоговая попытка была прервана (обновление/закрытие/выход) и засчитана как НЕ СДАЛ.");
      }
      const all = await fetchUserResults(session.id);
      setResults(all);
    })();
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
    ignoreZeroTimeLeftOnceRef.current = true;
    setTimeLeft(Math.max(1, currentQuestion.timeLimitSec));
  }, [currentQuestion?.id, activeTest]);

  useEffect(() => {
    if (!activeTest || !currentQuestion || trialFeedback) return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) return 0;
        if (prev <= 1) {
          queueMicrotask(() => {
            if (ignoreZeroTimeLeftOnceRef.current) {
              ignoreZeroTimeLeftOnceRef.current = false;
              return;
            }
            const at = activeTestRef.current;
            const q = currentQuestionRef.current;
            if (!q || !at) return;
            if (at === "trial") {
              setTrialFeedback({ chosen: null, correct: q.correctIndex });
              setAnswers((prev) => {
                const next = { ...prev, [q.id]: -1 };
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
    if (questionPool.length === 0) {
      setMessage(
        testConfig.uavAutoGeneration
          ? "Нет карточек БПЛА с ТТХ и нет активных вопросов в банке. Заполните справочник БПЛА или добавьте вопросы в админке."
          : "Нет активных вопросов в банке. Добавьте их в разделе «Админ / Тесты».",
      );
      return;
    }
    const randomQuestions = applySessionTimeLimits(
      pickRandomQuestions(questionPool, testConfig.trialQuestionCount),
      testConfig.timePerQuestionSec,
    );
    const first = randomQuestions[0];
    ignoreZeroTimeLeftOnceRef.current = true;
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
    if (questionPool.length === 0) {
      setMessage(
        testConfig.uavAutoGeneration
          ? "Нет карточек БПЛА с ТТХ и нет активных вопросов в банке. Заполните справочник БПЛА или добавьте вопросы в админке."
          : "Нет активных вопросов в банке. Добавьте их в разделе «Админ / Тесты».",
      );
      return;
    }
    const randomQuestions = applySessionTimeLimits(
      pickRandomQuestions(questionPool, testConfig.finalQuestionCount),
      testConfig.timePerQuestionSec,
    );
    const first = randomQuestions[0];
    await beginFinalAttempt(session.id);
    ignoreZeroTimeLeftOnceRef.current = true;
    setTrialFeedback(null);
    setActiveTest("final");
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    answersRef.current = {};
    if (first) setTimeLeft(Math.max(1, first.timeLimitSec));
    setMessage(`Итоговый тест запущен: ${randomQuestions.length} случайных вопросов. Режим строгий.`);
  };

  const trialButtonStyle = (index: number): CSSProperties | undefined => {
    if (activeTest !== "trial" || !trialFeedback) return undefined;
    const { chosen, correct } = trialFeedback;
    if (index === correct) {
      return {
        border: "2px solid #198754",
        backgroundColor: "#d1e7dd",
      };
    }
    if (chosen !== null && index === chosen && chosen !== correct) {
      return {
        border: "2px solid #dc3545",
        backgroundColor: "#f8d7da",
      };
    }
    return { opacity: 0.75 };
  };

  return (
    <section>
      <h1 className="page-title">Тестирование</h1>
      <p className="page-subtitle">
        {testConfig.uavAutoGeneration
          ? "В тест попадают вопросы из ТТХ карточек БПЛА (обновляются при каждом заходе на страницу) и активные вопросы из банка администратора."
          : "Используются только вопросы из банка в «Админ / Тесты»."}{" "}
        Случайная выборка. На каждый вопрос — <strong>{testConfig.timePerQuestionSec}</strong> сек (задаётся в админке).
      </p>

      <div className="grid grid-two">
        <article className="card">
          <div className="card-body">
            <h3>Пробный тест</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Без штрафов за выход. Можно проходить многократно. После ответа или истечения времени показывается подсветка
              верного варианта.
            </p>
            <button className="btn btn-primary" type="button" onClick={onTrial}>
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
              <button className="btn btn-primary" type="button" onClick={startFinal}>
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
                  className="btn"
                  type="button"
                  key={`${currentQuestion.id}-${index}-${option}`}
                  style={trialButtonStyle(index)}
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

      <h2 className="page-title" style={{ marginTop: 16, fontSize: 18 }}>
        История попыток
      </h2>
      <div className="list">
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
        {!results.length && <p className="page-subtitle">Попыток пока нет.</p>}
      </div>
    </section>
  );
}

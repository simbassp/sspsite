"use client";

import { useEffect, useMemo, useState } from "react";
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
import { TestConfig, TestQuestion, TestResult } from "@/lib/types";

function pickRandomQuestions(bank: TestQuestion[], count: number) {
  const cloned = [...bank];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned.slice(0, Math.max(1, Math.min(count, cloned.length)));
}

export default function TestsPage() {
  const session = useMemo(() => readClientSession(), []);
  const [results, setResults] = useState<TestResult[]>([]);
  const [questionPool, setQuestionPool] = useState<TestQuestion[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<TestQuestion[]>([]);
  const [testConfig, setTestConfig] = useState<TestConfig>({ trialQuestionCount: 3, finalQuestionCount: 5 });
  const [message, setMessage] = useState("");
  const [activeTest, setActiveTest] = useState<"trial" | "final" | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isAnswering, setIsAnswering] = useState(false);

  const refresh = async () => {
    if (!session) return;
    const all = await fetchUserResults(session.id);
    setResults(all);
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      await seedDefaultQuestionsIfEmpty();
      const [pool, config] = await Promise.all([fetchActiveQuestionPool(), fetchTestConfig()]);
      setQuestionPool(pool);
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
    setTimeLeft(Math.max(1, currentQuestion.timeLimitSec));
  }, [currentQuestion, activeTest]);

  useEffect(() => {
    if (!activeTest || !currentQuestion) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeTest, currentQuestion?.id]);

  if (!session) {
    return <p className="page-subtitle">Ошибка сессии. Перезайдите в систему.</p>;
  }

  const finishAttempt = async (type: "trial" | "final", finalAnswers: Record<string, number>) => {
    const questions = activeQuestions;
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
    await refresh();
  };

  const answerCurrent = async (optionIndex: number) => {
    if (!activeTest || !currentQuestion || isAnswering) return;
    setIsAnswering(true);
    const nextAnswers = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(nextAnswers);

    if (questionIndex < activeQuestions.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      if (activeTest === "final") {
        await persistFinalAttempt({
          userId: session.id,
          startedAt: new Date().toISOString(),
          questionIndex: nextIndex,
          answers: Object.fromEntries(Object.entries(nextAnswers).map(([k, v]) => [k, String(v)])),
        });
      }
      setIsAnswering(false);
      return;
    }

    await finishAttempt(activeTest, nextAnswers);
    setIsAnswering(false);
  };

  useEffect(() => {
    if (!activeTest || !currentQuestion) return;
    if (timeLeft > 0) return;
    void answerCurrent(-1);
  }, [timeLeft, activeTest, currentQuestion]);

  const onTrial = async () => {
    if (questionPool.length === 0) {
      setMessage("Банк вопросов пока не настроен администратором.");
      return;
    }
    const randomQuestions = pickRandomQuestions(questionPool, testConfig.trialQuestionCount);
    setActiveTest("trial");
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    setMessage(`Пробный тест запущен: ${randomQuestions.length} случайных вопросов.`);
  };

  const startFinal = async () => {
    if (questionPool.length === 0) {
      setMessage("Банк вопросов пока не настроен администратором.");
      return;
    }
    const randomQuestions = pickRandomQuestions(questionPool, testConfig.finalQuestionCount);
    await beginFinalAttempt(session.id);
    setActiveTest("final");
    setSelectedQuestions(randomQuestions);
    setQuestionIndex(0);
    setAnswers({});
    setMessage(`Итоговый тест запущен: ${randomQuestions.length} случайных вопросов. Режим строгий.`);
  };

  return (
    <section>
      <h1 className="page-title">Тестирование</h1>
      <p className="page-subtitle">Пробный тест в мягком режиме и итоговый в строгом.</p>

      <div className="grid grid-two">
        <article className="card">
          <div className="card-body">
            <h3>Пробный тест</h3>
            <p className="page-subtitle" style={{ marginTop: 8 }}>
              Без штрафов за выход. Можно проходить многократно. Время задается администратором на каждый вопрос.
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
              Осталось времени: <strong>{timeLeft}</strong> сек
            </p>
            <h3 style={{ marginTop: 8 }}>{currentQuestion.text}</h3>
            <div className="form" style={{ marginTop: 10 }}>
              {currentQuestion.options.map((option, index) => (
                <button
                  className="btn"
                  type="button"
                  key={`${currentQuestion.id}-${index}-${option}`}
                  onClick={() => void answerCurrent(index)}
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

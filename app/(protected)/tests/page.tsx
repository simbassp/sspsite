"use client";

import { useEffect, useMemo, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { formatDate } from "@/lib/format";
import {
  beginFinalAttempt,
  createTrialResult,
  fetchUserResults,
  finishFinalAttempt,
  forceFailFinalAttempt,
  loadFinalAttempt,
  persistFinalAttempt,
} from "@/lib/tests-repository";
import { TestResult } from "@/lib/types";

type Question = {
  id: number;
  text: string;
  options: string[];
  correct: number;
};

const trialQuestions: Question[] = [
  { id: 1, text: "Что делать при потере связи с БПЛА?", options: ["Продолжить полет", "Сообщить по протоколу", "Игнорировать"], correct: 1 },
  { id: 2, text: "Первое действие при тревоге?", options: ["Ожидать", "Проверить оборудование", "Покинуть пост"], correct: 1 },
  { id: 3, text: "Как фиксировать результат тренировки?", options: ["Устно", "В журнале", "Не фиксировать"], correct: 1 },
];

const finalQuestions: Question[] = [
  { id: 1, text: "Ключевой канал обнаружения низколетящего БПЛА?", options: ["Визуальный пост", "Только метеосводка", "Архив новостей"], correct: 0 },
  { id: 2, text: "Что критично при работе РЭБ?", options: ["Согласование диапазонов", "Случайная частота", "Отключенный журнал"], correct: 0 },
  { id: 3, text: "Минимум для допуска к итоговому тесту?", options: ["Регистрация", "Изучение материала и пробный тест", "Только наличие позывного"], correct: 1 },
  { id: 4, text: "При угрозе повторной атаки нужно:", options: ["Снять наблюдение", "Усилить мониторинг", "Отключить средства связи"], correct: 1 },
  { id: 5, text: "После завершения операции сотрудник:", options: ["Игнорирует отчет", "Фиксирует действия и итоги", "Удаляет записи"], correct: 1 },
];

export default function TestsPage() {
  const session = useMemo(() => readClientSession(), []);
  const [results, setResults] = useState<TestResult[]>([]);
  const [message, setMessage] = useState("");
  const [finalActive, setFinalActive] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const refresh = async () => {
    if (!session) return;
    const all = await fetchUserResults(session.id);
    setResults(all);
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      const orphanAttempt = await loadFinalAttempt(session.id);
      if (orphanAttempt) {
        await forceFailFinalAttempt(session.id);
        setMessage("Итоговая попытка была прервана (обновление/закрытие/выход) и засчитана как НЕ СДАЛ.");
      }
      const all = await fetchUserResults(session.id);
      setResults(all);
    })();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    if (!finalActive) return;

    const onExit = () => {
      forceFailFinalAttempt(session.id);
    };

    window.addEventListener("beforeunload", onExit);
    window.addEventListener("pagehide", onExit);
    return () => {
      window.removeEventListener("beforeunload", onExit);
      window.removeEventListener("pagehide", onExit);
    };
  }, [finalActive, session]);

  if (!session) {
    return <p className="page-subtitle">Ошибка сессии. Перезайдите в систему.</p>;
  }

  const onTrial = async () => {
    let points = 0;
    trialQuestions.forEach(() => {
      if (Math.random() > 0.2) points += 1;
    });
    const score = Math.round((points / trialQuestions.length) * 100);
    await createTrialResult(session.id, score);
    setMessage(`Пробный тест завершен: ${score}%.`);
    await refresh();
  };

  const startFinal = async () => {
    await beginFinalAttempt(session.id);
    setFinalActive(true);
    setQuestionIndex(0);
    setAnswers({});
    setMessage("Итоговый тест запущен. Режим строгий: прерывание = не сдал.");
  };

  const answerCurrent = async (optionIndex: number) => {
    const currentQuestion = finalQuestions[questionIndex];
    const nextAnswers = { ...answers, [currentQuestion.id]: optionIndex };
    setAnswers(nextAnswers);

    if (questionIndex < finalQuestions.length - 1) {
      const nextIndex = questionIndex + 1;
      setQuestionIndex(nextIndex);
      await persistFinalAttempt({
        userId: session.id,
        startedAt: new Date().toISOString(),
        questionIndex: nextIndex,
        answers: Object.fromEntries(Object.entries(nextAnswers).map(([k, v]) => [Number(k), String(v)])),
      });
      return;
    }

    const correct = finalQuestions.reduce((acc, q) => acc + (nextAnswers[q.id] === q.correct ? 1 : 0), 0);
    const score = Math.round((correct / finalQuestions.length) * 100);
    const passed = score >= 80;
    await finishFinalAttempt(session.id, score, passed);
    setFinalActive(false);
    setMessage(`Итоговый тест завершен: ${score}%. Статус: ${passed ? "СДАЛ" : "НЕ СДАЛ"}.`);
    await refresh();
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
              Без штрафов за выход. Можно проходить многократно.
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
            {!finalActive && (
              <button className="btn btn-primary" type="button" onClick={startFinal}>
                Начать итоговый тест
              </button>
            )}
          </div>
        </article>
      </div>

      {finalActive && (
        <article className="card" style={{ marginTop: 12 }}>
          <div className="card-body">
            <p className="label">
              Вопрос {questionIndex + 1} / {finalQuestions.length}
            </p>
            <h3 style={{ marginTop: 8 }}>{finalQuestions[questionIndex].text}</h3>
            <div className="form" style={{ marginTop: 10 }}>
              {finalQuestions[questionIndex].options.map((option, index) => (
                <button className="btn" type="button" key={option} onClick={() => answerCurrent(index)}>
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

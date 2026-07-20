"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import { loadGameQuestionPool } from "@/lib/game-question-pool";
import { getGameModeConfig, type GameModeId } from "@/lib/game-modes";
import { pickGameQuestions } from "@/lib/game-seeded-pick";
import { saveGameResult } from "@/lib/game-stats";
import { loadRecentQuestionIds, rememberQuestionIds } from "@/lib/test-question-selection";
import type { TestQuestion } from "@/lib/types";

type Phase = "loading" | "intro" | "playing" | "feedback" | "finished";

type FeedbackState = {
  chosen: number;
  correct: number;
  opponentNote?: string;
};

function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function simulateDuelBot(total: number) {
  const answers: boolean[] = [];
  for (let i = 0; i < total; i += 1) {
    answers.push(Math.random() < 0.68);
  }
  return answers;
}

export function GameSessionPage({ modeId }: { modeId: GameModeId }) {
  const config = getGameModeConfig(modeId);
  const router = useRouter();
  const session = useMemo(() => readClientSession(), []);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [duelBot, setDuelBot] = useState<boolean[]>([]);
  const [duelBotScore, setDuelBotScore] = useState(0);
  const [resultLabel, setResultLabel] = useState("");
  const [won, setWon] = useState<boolean | undefined>(undefined);

  const feedbackTimerRef = useRef<number | null>(null);
  const finishRef = useRef<(reason: string) => void>(() => {});
  const correctRef = useRef(0);
  const answeredRef = useRef(0);
  const duelBotScoreRef = useRef(0);

  const current = questions[index] ?? null;

  const prepareQuestions = useCallback(
    (pool: TestQuestion[]) => {
      const recent = session ? loadRecentQuestionIds(session.id) : [];
      const count = config.prepareCount ?? Math.min(20, pool.length);
      const picked = pickGameQuestions(pool, count, recent);
      if (session && picked.length) rememberQuestionIds(session.id, picked.map((q) => q.id));
      if (modeId === "ladder") return picked.slice(0, Math.min(100, picked.length));
      return picked;
    },
    [config.prepareCount, modeId, session],
  );

  const finishGame = useCallback(
    (reason: string) => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = null;
      }

      const finalCorrect = correctRef.current;
      const finalAnswered = answeredRef.current;
      let label = reason;
      let victory: boolean | undefined;

      if (config.opponentKind === "duel") {
        const playerScore = finalCorrect;
        const botScore = duelBot.slice(0, finalAnswered).filter(Boolean).length;
        victory = playerScore > botScore;
        label =
          playerScore === botScore
            ? `Ничья ${playerScore}:${botScore}`
            : victory
              ? `Победа ${playerScore}:${botScore}`
              : `Поражение ${playerScore}:${botScore}`;
      } else if (modeId === "blitz") {
        label = `${finalCorrect} правильных за 60 секунд`;
      } else if (modeId === "survival") {
        label = `Серия: ${finalCorrect} без ошибок`;
      } else if (modeId === "ladder") {
        label =
          finalCorrect === questions.length && finalAnswered === questions.length
            ? `Лестница пройдена: ${finalCorrect}/${questions.length}`
            : `Остановились на ${finalCorrect}/${questions.length}`;
      }

      saveGameResult({
        mode: modeId,
        correct: finalCorrect,
        total: Math.max(finalAnswered, questions.length),
        label,
        won: victory,
      });

      setResultLabel(label);
      setWon(victory);
      setPhase("finished");
    },
    [config.opponentKind, duelBot, modeId, questions.length],
  );

  finishRef.current = finishGame;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase("loading");
      setError("");
      const pool = await loadGameQuestionPool();
      if (cancelled) return;
      if (!pool.length) {
        setError("Нет вопросов в банке тестов. Добавьте активные вопросы в разделе «Админ → Тесты».");
        setPhase("intro");
        return;
      }
      const prepared = prepareQuestions(pool);
      if (!prepared.length) {
        setError("Не удалось подобрать вопросы для режима.");
        setPhase("intro");
        return;
      }
      setQuestions(prepared);
      if (config.opponentKind === "duel") setDuelBot(simulateDuelBot(prepared.length));
      setPhase("intro");
    })();
    return () => {
      cancelled = true;
    };
  }, [config.opponentKind, prepareQuestions]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    if (config.totalTimeSec) {
      const timer = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            finishRef.current("Время вышло");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => window.clearInterval(timer);
    }

    const perQuestion = questions[index]?.timeLimitSec || config.perQuestionSec;
    setTimeLeft(perQuestion);
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          finishRef.current(config.failOnWrong ? "Время на вопрос вышло" : "Время на вопрос вышло");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, index, config.totalTimeSec, config.perQuestionSec, config.failOnWrong, questions]);

  const startGame = () => {
    setIndex(0);
    setCorrectCount(0);
    setAnsweredCount(0);
    correctRef.current = 0;
    answeredRef.current = 0;
    setDuelBotScore(0);
    duelBotScoreRef.current = 0;
    if (config.opponentKind === "duel") setDuelBot(simulateDuelBot(questions.length));
    setFeedback(null);
    setPhase("playing");
    setTimeLeft(config.totalTimeSec ?? (questions[0]?.timeLimitSec || config.perQuestionSec));
  };

  const goNextQuestion = () => {
    setFeedback(null);
    if (config.totalTimeSec) {
      if (index + 1 < questions.length) {
        setIndex((prev) => prev + 1);
      }
      return;
    }
    if (index + 1 >= questions.length) {
      finishGame("Режим завершён");
      return;
    }
    setIndex((prev) => prev + 1);
    setTimeLeft(questions[index + 1]?.timeLimitSec || config.perQuestionSec);
  };

  const onAnswer = (optionIndex: number) => {
    if (phase !== "playing" || !current || feedback) return;

    const isCorrect = optionIndex === current.correctIndex;
    const nextAnswered = answeredRef.current + 1;
    const nextCorrect = correctRef.current + (isCorrect ? 1 : 0);
    answeredRef.current = nextAnswered;
    correctRef.current = nextCorrect;
    setAnsweredCount(nextAnswered);
    if (isCorrect) setCorrectCount(nextCorrect);

    let opponentNote: string | undefined;
    if (config.opponentKind === "duel") {
      const botCorrect = duelBot[index] === true;
      const nextBotScore = duelBotScoreRef.current + (botCorrect ? 1 : 0);
      duelBotScoreRef.current = nextBotScore;
      setDuelBotScore(nextBotScore);
      opponentNote = botCorrect ? "Соперник ответил верно" : "Соперник ошибся";
    }

    if (config.failOnWrong && !isCorrect) {
      setFeedback({ chosen: optionIndex, correct: current.correctIndex, opponentNote });
      setPhase("feedback");
      feedbackTimerRef.current = window.setTimeout(() => {
        finishGame("Ошибка — попытка завершена");
      }, config.revealFeedbackMs || 600);
      return;
    }

    if (config.revealFeedbackMs > 0) {
      setFeedback({ chosen: optionIndex, correct: current.correctIndex, opponentNote });
      setPhase("feedback");
      feedbackTimerRef.current = window.setTimeout(() => {
        setPhase("playing");
        if (!config.totalTimeSec && index + 1 >= questions.length) {
          finishGame("Все вопросы пройдены");
          return;
        }
        goNextQuestion();
      }, config.revealFeedbackMs);
      return;
    }

    if (config.totalTimeSec) {
      if (index + 1 < questions.length) setIndex((prev) => prev + 1);
      return;
    }

    if (index + 1 >= questions.length) {
      finishGame("Все вопросы пройдены");
      return;
    }
    goNextQuestion();
  };

  const timerLabel = config.totalTimeSec ? "Осталось" : "На вопрос";
  const progressLabel = config.totalTimeSec
    ? `${correctCount} верно · ${answeredCount} ответов`
    : `Вопрос ${Math.min(index + 1, questions.length)} / ${questions.length}`;

  return (
    <section className="game-session">
      <div className="game-session__head">
        <Link href="/game" className="btn game-session__back">
          ← Полигон
        </Link>
        <div>
          <p className="game-page__kicker">Preview · только администратор</p>
          <h1 className="page-title">{config.title}</h1>
          <p className="page-subtitle">{config.description}</p>
        </div>
      </div>

      {phase === "loading" ? (
        <article className="card">
          <div className="card-body">
            <p className="page-subtitle">Загружаем вопросы…</p>
          </div>
        </article>
      ) : null}

      {phase === "intro" ? (
        <article className="card game-session__intro">
          <div className="card-body">
            {error ? <p className="game-session__error">{error}</p> : null}
            {!error ? (
              <>
                <p className="label">Готовы?</p>
                <h2>{config.title}</h2>
                <ul className="game-session__rules">
                  {config.totalTimeSec ? <li>{config.totalTimeSec} секунд на всю игру</li> : null}
                  {!config.totalTimeSec && config.prepareCount ? (
                    <li>До {config.prepareCount} вопросов</li>
                  ) : null}
                  {config.failOnWrong ? <li>Одна ошибка — конец попытки</li> : null}
                  {config.opponentKind === "duel" ? <li>Соперник: бот (preview)</li> : null}
                </ul>
                <button type="button" className="btn btn-primary" onClick={startGame} disabled={!questions.length}>
                  Начать
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => router.push("/game")}>
                Назад к режимам
              </button>
            )}
          </div>
        </article>
      ) : null}

      {(phase === "playing" || phase === "feedback") && current ? (
        <article className="card game-session__play">
          <div className="card-body">
            <div className="game-session__hud">
              <span>{progressLabel}</span>
              <strong>
                {timerLabel}: {timeLeft} с
              </strong>
              {config.opponentKind === "duel" ? (
                <span className="game-session__versus">
                  Вы {correctCount} : {duelBotScore} Бот
                </span>
              ) : null}
            </div>

            <h2 className="game-session__question">{current.text}</h2>

            <div className="game-session__options">
              {current.options.map((option, optionIndex) => {
                const isChosen = feedback?.chosen === optionIndex;
                const isCorrectOption = feedback && optionIndex === feedback.correct;
                const isWrongChosen = feedback && isChosen && optionIndex !== feedback.correct;
                return (
                  <button
                    key={`${current.id}-${optionIndex}`}
                    type="button"
                    className={[
                      "btn game-session__option",
                      isCorrectOption ? "is-correct" : "",
                      isWrongChosen ? "is-wrong" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={phase === "feedback"}
                    onClick={() => onAnswer(optionIndex)}
                  >
                    <span className="game-session__option-letter">{optionLetter(optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>

            {feedback?.opponentNote ? <p className="game-session__opponent">{feedback.opponentNote}</p> : null}
          </div>
        </article>
      ) : null}

      {phase === "finished" ? (
        <article className="card game-session__result">
          <div className="card-body">
            <p className="label">Результат</p>
            <h2>{resultLabel}</h2>
            <p className="page-subtitle">
              Верных ответов: {correctCount}
              {answeredCount ? ` из ${answeredCount}` : ""}
              {won === true ? " · Победа" : null}
              {won === false ? " · Поражение" : null}
            </p>
            <div className="game-session__actions">
              <button type="button" className="btn btn-primary" onClick={startGame}>
                Ещё раз
              </button>
              <Link href="/game" className="btn">
                К режимам
              </Link>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}

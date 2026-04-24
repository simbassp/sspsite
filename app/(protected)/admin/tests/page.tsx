"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteAdminQuestion,
  fetchAdminQuestionBank,
  fetchAllResults,
  saveAdminQuestion,
  seedDefaultQuestionsIfEmpty,
} from "@/lib/tests-repository";
import { TestQuestion, TestResult, TestType } from "@/lib/types";

type DraftQuestion = {
  id?: string;
  type: TestType;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
  order: number;
  isActive: boolean;
};

const initialDraft: DraftQuestion = {
  type: "final",
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  timeLimitSec: 45,
  order: 1,
  isActive: true,
};

export default function AdminTestsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [draft, setDraft] = useState<DraftQuestion>(initialDraft);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      await seedDefaultQuestionsIfEmpty();
      const [allResults, allQuestions] = await Promise.all([fetchAllResults(), fetchAdminQuestionBank()]);
      setResults(allResults);
      setQuestions(allQuestions);
      const maxOrder = allQuestions.reduce((acc, item) => Math.max(acc, item.order), 0);
      setDraft((prev) => ({ ...prev, order: maxOrder + 1 }));
    })();
  }, []);

  const { trial, final, failedFinal, trialQuestions, finalQuestions } = useMemo(() => {
    return {
      trial: results.filter((item) => item.type === "trial").length,
      final: results.filter((item) => item.type === "final").length,
      failedFinal: results.filter((item) => item.type === "final" && item.status === "failed").length,
      trialQuestions: questions.filter((q) => q.type === "trial").length,
      finalQuestions: questions.filter((q) => q.type === "final").length,
    };
  }, [results, questions]);

  const refreshQuestions = async () => {
    const allQuestions = await fetchAdminQuestionBank();
    setQuestions(allQuestions);
    const maxOrder = allQuestions.reduce((acc, item) => Math.max(acc, item.order), 0);
    setDraft((prev) => ({ ...prev, order: prev.id ? prev.order : maxOrder + 1 }));
  };

  const onSaveQuestion = async () => {
    setMessage("");
    const text = draft.text.trim();
    const options = draft.options.map((item) => item.trim()).filter(Boolean);

    if (!text) {
      setMessage("Введите текст вопроса.");
      return;
    }
    if (options.length < 2) {
      setMessage("Нужно минимум 2 варианта ответа.");
      return;
    }
    if (draft.correctIndex < 0 || draft.correctIndex > options.length - 1) {
      setMessage("Выберите корректный правильный ответ.");
      return;
    }

    await saveAdminQuestion({
      id: draft.id,
      type: draft.type,
      text,
      options,
      correctIndex: draft.correctIndex,
      timeLimitSec: Math.max(5, draft.timeLimitSec),
      order: Math.max(1, draft.order),
      isActive: draft.isActive,
    });
    setMessage(draft.id ? "Вопрос обновлен." : "Вопрос добавлен.");
    setDraft(initialDraft);
    await refreshQuestions();
  };

  const onEdit = (question: TestQuestion) => {
    setMessage("");
    const options = [...question.options];
    while (options.length < 4) options.push("");
    setDraft({
      id: question.id,
      type: question.type,
      text: question.text,
      options,
      correctIndex: question.correctIndex,
      timeLimitSec: question.timeLimitSec,
      order: question.order,
      isActive: question.isActive,
    });
  };

  const onDelete = async (questionId: string) => {
    setMessage("");
    await deleteAdminQuestion(questionId);
    setMessage("Вопрос удален.");
    if (draft.id === questionId) {
      setDraft(initialDraft);
    }
    await refreshQuestions();
  };

  return (
    <section>
      <h1 className="page-title">Админ / Тесты</h1>
      <p className="page-subtitle">
        Управление банком вопросов (текст, варианты, правильный ответ, время) и мониторинг тестовой активности.
      </p>
      <div className="grid grid-two">
        <div className="card">
          <div className="card-body">
            <p className="label">Пробные попытки</p>
            <p className="stat-value">{trial}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Итоговые попытки</p>
            <p className="stat-value">{final}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Не сдали итоговый</p>
            <p className="stat-value">{failedFinal}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Вопросы пробного теста</p>
            <p className="stat-value">{trialQuestions}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Вопросы итогового теста</p>
            <p className="stat-value">{finalQuestions}</p>
          </div>
        </div>
      </div>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>{draft.id ? "Редактирование вопроса" : "Добавить вопрос"}</h3>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="label" htmlFor="question-type">
              Тип теста
            </label>
            <select
              id="question-type"
              className="input"
              value={draft.type}
              onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as TestType }))}
            >
              <option value="trial">Пробный</option>
              <option value="final">Итоговый</option>
            </select>

            <label className="label" htmlFor="question-text">
              Текст вопроса
            </label>
            <textarea
              id="question-text"
              className="input"
              rows={3}
              value={draft.text}
              onChange={(e) => setDraft((prev) => ({ ...prev, text: e.target.value }))}
            />

            {draft.options.map((option, idx) => (
              <div key={`option-${idx}`}>
                <label className="label" htmlFor={`option-${idx}`}>
                  Вариант {idx + 1}
                </label>
                <input
                  id={`option-${idx}`}
                  className="input"
                  value={option}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      options: prev.options.map((item, optionIdx) => (optionIdx === idx ? e.target.value : item)),
                    }))
                  }
                />
              </div>
            ))}

            <label className="label" htmlFor="correct-answer">
              Правильный ответ
            </label>
            <select
              id="correct-answer"
              className="input"
              value={draft.correctIndex}
              onChange={(e) => setDraft((prev) => ({ ...prev, correctIndex: Number(e.target.value) }))}
            >
              {draft.options.map((_, idx) => (
                <option key={`correct-${idx}`} value={idx}>
                  Вариант {idx + 1}
                </option>
              ))}
            </select>

            <label className="label" htmlFor="time-limit">
              Время на ответ (сек)
            </label>
            <input
              id="time-limit"
              className="input"
              type="number"
              min={5}
              value={draft.timeLimitSec}
              onChange={(e) => setDraft((prev) => ({ ...prev, timeLimitSec: Number(e.target.value) || 5 }))}
            />

            <label className="label" htmlFor="order-index">
              Порядок в тесте
            </label>
            <input
              id="order-index"
              className="input"
              type="number"
              min={1}
              value={draft.order}
              onChange={(e) => setDraft((prev) => ({ ...prev, order: Number(e.target.value) || 1 }))}
            />

            <label className="label" htmlFor="is-active">
              Статус
            </label>
            <select
              id="is-active"
              className="input"
              value={draft.isActive ? "active" : "inactive"}
              onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.value === "active" }))}
            >
              <option value="active">Активен</option>
              <option value="inactive">Отключен</option>
            </select>

            {message && <p className="page-subtitle">{message}</p>}

            <button className="btn btn-primary" type="button" onClick={() => void onSaveQuestion()}>
              {draft.id ? "Сохранить изменения" : "Добавить вопрос"}
            </button>
            {draft.id && (
              <button className="btn" type="button" onClick={() => setDraft(initialDraft)}>
                Отменить редактирование
              </button>
            )}
          </div>
        </div>
      </article>

      <div className="list" style={{ marginTop: 12 }}>
        {questions.map((question) => (
          <article className="card" key={question.id}>
            <div className="card-body">
              <div className="meta">
                <span className="pill">{question.type === "final" ? "Итоговый" : "Пробный"}</span>
                <span>Порядок: {question.order}</span>
                <span>Время: {question.timeLimitSec} сек</span>
                <span>{question.isActive ? "Активен" : "Отключен"}</span>
              </div>
              <h3 style={{ marginTop: 8 }}>{question.text}</h3>
              <div className="list" style={{ marginTop: 8 }}>
                {question.options.map((option, index) => (
                  <p key={`${question.id}-opt-${index}`} style={{ margin: 0 }}>
                    {index + 1}. {option} {index === question.correctIndex ? "(верный)" : ""}
                  </p>
                ))}
              </div>
              <div className="form" style={{ marginTop: 10 }}>
                <button className="btn" type="button" onClick={() => onEdit(question)}>
                  Редактировать
                </button>
                <button className="btn btn-danger" type="button" onClick={() => void onDelete(question.id)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
        {!questions.length && <p className="page-subtitle">Вопросов пока нет.</p>}
      </div>
    </section>
  );
}

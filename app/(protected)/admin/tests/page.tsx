"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteAdminQuestion,
  fetchAdminQuestionBank,
  fetchTestConfig,
  saveAdminQuestion,
  saveTestConfig,
  seedDefaultQuestionsIfEmpty,
} from "@/lib/tests-repository";
import { DEFAULT_TEST_CONFIG, normalizeTestConfig } from "@/lib/test-config";
import { TestConfig, TestQuestion, TestResult, TestType } from "@/lib/types";

type DraftQuestion = {
  id?: string;
  type: TestType;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimitSec: number;
  isActive: boolean;
};

const initialDraft: DraftQuestion = {
  type: "final",
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  timeLimitSec: 10,
  isActive: true,
};

export default function AdminTestsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [config, setConfig] = useState<TestConfig>(DEFAULT_TEST_CONFIG);
  const [draft, setDraft] = useState<DraftQuestion>(initialDraft);
  const [message, setMessage] = useState("");
  const [isEditingTimeLimit, setIsEditingTimeLimit] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        await seedDefaultQuestionsIfEmpty();
        const response = await fetch("/api/admin/tests/bootstrap", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          results?: Array<Record<string, unknown>>;
          questions?: Array<Record<string, unknown>>;
          config?: Record<string, unknown> | null;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "admin_tests_bootstrap_failed");
        }
        setResults(
          (payload.results || []).map((r) => ({
            id: String(r.id),
            userId: String(r.user_id),
            type: r.type === "final" ? "final" : "trial",
            status: r.status === "passed" ? "passed" : "failed",
            score: Number(r.score || 0),
            createdAt: String(r.created_at || ""),
          })) as TestResult[],
        );
        setQuestions(
          (payload.questions || []).map((q) => ({
            id: String(q.id),
            type: q.type === "trial" ? "trial" : "final",
            text: String(q.text || ""),
            options: Array.isArray(q.options) ? (q.options as string[]) : [],
            correctIndex: Number(q.correct_index || 0),
            timeLimitSec: Number(q.time_limit_sec || 10),
            order: Number(q.order_index || 1),
            isActive: Boolean(q.is_active),
            createdAt: String(q.created_at || ""),
          })) as TestQuestion[],
        );
        if (payload.config) {
          setConfig(
            normalizeTestConfig({
              trialQuestionCount: Number(payload.config.trial_question_count ?? DEFAULT_TEST_CONFIG.trialQuestionCount),
              finalQuestionCount: Number(payload.config.final_question_count ?? DEFAULT_TEST_CONFIG.finalQuestionCount),
              timePerQuestionSec: Number(payload.config.time_per_question_sec ?? DEFAULT_TEST_CONFIG.timePerQuestionSec),
              uavAutoGeneration: Boolean(payload.config.uav_auto_generation ?? DEFAULT_TEST_CONFIG.uavAutoGeneration),
            }),
          );
        } else {
          const testConfig = await fetchTestConfig();
          setConfig(testConfig);
        }
      } catch {
        setLoadError("Не удалось загрузить админские данные тестов. Попробуйте снова.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const { trial, final, failedFinal, totalQuestions, activeQuestions } = useMemo(() => {
    return {
      trial: results.filter((item) => item.type === "trial").length,
      final: results.filter((item) => item.type === "final").length,
      failedFinal: results.filter((item) => item.type === "final" && item.status === "failed").length,
      totalQuestions: questions.length,
      activeQuestions: questions.filter((item) => item.isActive).length,
    };
  }, [results, questions]);

  const refreshQuestions = async () => {
    const allQuestions = await fetchAdminQuestionBank();
    setQuestions(allQuestions);
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

    const maxOrder = questions.reduce((acc, item) => Math.max(acc, item.order), 0);
    const currentOrder = draft.id ? (questions.find((item) => item.id === draft.id)?.order ?? maxOrder + 1) : maxOrder + 1;
    const timeLimitSec = isEditingTimeLimit ? Math.max(5, draft.timeLimitSec) : 10;

    await saveAdminQuestion({
      id: draft.id,
      type: draft.type,
      text,
      options,
      correctIndex: draft.correctIndex,
      timeLimitSec,
      order: Math.max(1, currentOrder),
      isActive: draft.isActive,
    });
    setMessage(draft.id ? "Вопрос обновлен." : "Вопрос добавлен.");
    setDraft(initialDraft);
    setIsEditingTimeLimit(false);
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
      isActive: question.isActive,
    });
    setIsEditingTimeLimit(question.timeLimitSec !== 10);
  };

  const onDelete = async (questionId: string) => {
    setMessage("");
    await deleteAdminQuestion(questionId);
    setMessage("Вопрос удален.");
    if (draft.id === questionId) {
      setDraft(initialDraft);
      setIsEditingTimeLimit(false);
    }
    await refreshQuestions();
  };

  const onSaveConfig = async () => {
    setMessage("");
    setIsSavingConfig(true);
    try {
      const nextConfig = await saveTestConfig(normalizeTestConfig(config));
      setConfig(nextConfig);
      setMessage("Настройки тестов сохранены.");
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <section>
      <h1 className="page-title">Админ / Тесты</h1>
      {isLoading && <p className="page-subtitle">Загружаем данные...</p>}
      {!isLoading && !!loadError && (
        <div className="form" style={{ marginBottom: 12 }}>
          <p className="page-subtitle">{loadError}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </div>
      )}
      <p className="page-subtitle">
        Ниже — настройки тестов (время на вопрос, генерация из БПЛА, число вопросов) и ручной банк вопросов в БД.
        При включённой генерации вопросы по ТТХ пересобираются при каждом заходе сотрудника на «Тестирование» и
        объединяются с активными вопросами из банка. Если генерация выключена — в тесте только ваш банк.
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
            <p className="label">Всего вопросов в банке</p>
            <p className="stat-value">{totalQuestions}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="label">Активных вопросов</p>
            <p className="stat-value">{activeQuestions}</p>
          </div>
        </div>
      </div>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>Настройки выборки вопросов</h3>
          <div className="form" style={{ marginTop: 10 }}>
            <label className="label" htmlFor="trial-count">
              Сколько вопросов в пробном тесте
            </label>
            <input
              id="trial-count"
              className="input"
              type="number"
              min={1}
              value={config.trialQuestionCount}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, trialQuestionCount: Number(e.target.value) || 1 }))
              }
            />

            <label className="label" htmlFor="final-count">
              Сколько вопросов в итоговом тесте
            </label>
            <input
              id="final-count"
              className="input"
              type="number"
              min={1}
              value={config.finalQuestionCount}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, finalQuestionCount: Number(e.target.value) || 1 }))
              }
            />

            <label className="label" htmlFor="time-per-q">
              Секунд на один вопрос (пробный и итоговый тест)
            </label>
            <input
              id="time-per-q"
              className="input"
              type="number"
              min={5}
              max={600}
              value={config.timePerQuestionSec}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  timePerQuestionSec: Math.max(5, Number(e.target.value) || 5),
                }))
              }
            />

            <p className="label" style={{ marginTop: 12 }}>
              Генерация вопросов из ТТХ БПЛА
            </p>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Выключите, если хотите использовать только свой банк вопросов ниже.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button
                className={`btn${config.uavAutoGeneration ? " btn-primary" : ""}`}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, uavAutoGeneration: true }))}
              >
                Включить
              </button>
              <button
                className={`btn${!config.uavAutoGeneration ? " btn-primary" : ""}`}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, uavAutoGeneration: false }))}
              >
                Выключить
              </button>
            </div>

            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void onSaveConfig()}
              style={{ marginTop: 14 }}
              disabled={isSavingConfig}
            >
              {isSavingConfig ? "Сохраняем..." : "Сохранить настройки тестов"}
            </button>
          </div>
        </div>
      </article>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>{draft.id ? "Редактирование вопроса" : "Добавить вопрос"}</h3>
          <div className="form" style={{ marginTop: 10 }}>
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
              Время на ответ: 10 сек по умолчанию
            </label>
            <button className="btn" type="button" onClick={() => setIsEditingTimeLimit((prev) => !prev)}>
              {isEditingTimeLimit ? "Скрыть изменение времени" : "Изменить время"}
            </button>
            {isEditingTimeLimit && (
              <input
                id="time-limit"
                className="input"
                type="number"
                min={5}
                value={draft.timeLimitSec}
                onChange={(e) => setDraft((prev) => ({ ...prev, timeLimitSec: Number(e.target.value) || 5 }))}
              />
            )}

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
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setDraft(initialDraft);
                  setIsEditingTimeLimit(false);
                }}
              >
                Отменить редактирование
              </button>
            )}
          </div>
        </div>
      </article>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3>Банк вопросов</h3>
          <p className="page-subtitle">Всего: {questions.length}</p>
          <div className="list" style={{ marginTop: 10 }}>
            {questions.map((question) => (
              <article className="card" key={question.id}>
                <div className="card-body">
                  <div className="meta">
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
        </div>
      </article>
    </section>
  );
}

"use client";

import type { ReactNode } from "react";

type NewsEditorFormProps = {
  title: string;
  body: string;
  priority: "normal" | "high" | "update";
  bodyRef?: React.RefObject<HTMLTextAreaElement | null>;
  submitLabel: string;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onPriorityChange: (value: "normal" | "high" | "update") => void;
  onSubmit: () => void;
  onCancel: () => void;
  toolbar?: ReactNode;
};

export function NewsEditorForm({
  title,
  body,
  priority,
  bodyRef,
  submitLabel,
  onTitleChange,
  onBodyChange,
  onPriorityChange,
  onSubmit,
  onCancel,
  toolbar,
}: NewsEditorFormProps) {
  return (
    <div className="news-editor-form">
      <input
        className="input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Заголовок"
      />
      <textarea
        ref={bodyRef}
        className="input"
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder="Текст новости"
        style={{ minHeight: 120 }}
      />
      {toolbar}
      <select className="select" value={priority} onChange={(e) => onPriorityChange(e.target.value as typeof priority)}>
        <option value="normal">Новость</option>
        <option value="high">Важная</option>
        <option value="update">Update</option>
      </select>
      <div className="news-editor-form__actions">
        <button className="btn btn-primary" type="button" onClick={onSubmit}>
          {submitLabel}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

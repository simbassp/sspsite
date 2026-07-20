"use client";

import { useEffect, useState } from "react";

type AchievementUnlockBannerProps = {
  notifications: Array<{ id: string; title: string; body: string }>;
  onDismiss: (ids: string[]) => void;
};

export function AchievementUnlockBanner({ notifications, onDismiss }: AchievementUnlockBannerProps) {
  const [visible, setVisible] = useState(notifications);
  useEffect(() => setVisible(notifications), [notifications]);

  if (!visible.length) return null;

  const current = visible[0];

  return (
    <div className="achievement-unlock-banner" role="status">
      <div className="achievement-unlock-banner__body">
        <strong>{current.title}</strong>
        <span>{current.body}</span>
      </div>
      <button
        type="button"
        className="btn achievement-unlock-banner__btn"
        onClick={() => {
          const ids = visible.map((item) => item.id);
          setVisible([]);
          onDismiss(ids);
        }}
      >
        Понятно
      </button>
    </div>
  );
}

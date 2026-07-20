"use client";

import { useEffect, useState } from "react";
import {
  FINAL_ACHIEVEMENTS,
  TRIAL_ACHIEVEMENTS,
  finalNameColorClass,
  finalNameColorLabel,
  trialAvatarFrameClass,
  trialFrameLabel,
  unlockedFinalNameColors,
  unlockedTrialFrames,
  type FinalNameColorId,
  type TrialAvatarFrameId,
} from "@/lib/achievements-catalog";
import { UserAvatar } from "@/components/profile/UserAvatar";

type ProfileCosmeticsModalProps = {
  open: boolean;
  onClose: () => void;
  unlockedIds: string[];
  adminPreviewAll?: boolean;
  name: string;
  callsign: string;
  avatarUrl: string | null;
  avatarFrame: TrialAvatarFrameId | null;
  nameColor: FinalNameColorId | null;
  onSave: (next: { avatarFrame: TrialAvatarFrameId | null; nameColor: FinalNameColorId | null }) => void;
  saving?: boolean;
};

export function ProfileCosmeticsModal({
  open,
  onClose,
  unlockedIds,
  adminPreviewAll = false,
  name,
  callsign,
  avatarUrl,
  avatarFrame,
  nameColor,
  onSave,
  saving = false,
}: ProfileCosmeticsModalProps) {
  const [draftFrame, setDraftFrame] = useState<TrialAvatarFrameId | null>(avatarFrame);
  const [draftColor, setDraftColor] = useState<FinalNameColorId | null>(nameColor);

  useEffect(() => {
    if (!open) return;
    setDraftFrame(avatarFrame);
    setDraftColor(nameColor);
  }, [open, avatarFrame, nameColor]);

  const frames = adminPreviewAll
    ? TRIAL_ACHIEVEMENTS.map((item) => item.trialFrame!).filter(Boolean)
    : unlockedTrialFrames(unlockedIds);
  const colors = adminPreviewAll
    ? FINAL_ACHIEVEMENTS.map((item) => item.finalNameColor!).filter(Boolean)
    : unlockedFinalNameColors(unlockedIds);

  if (!open) return null;

  return (
    <div className="personnel-modal-backdrop" onClick={onClose}>
      <div className="card profile-cosmetics-modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-body">
          <div className="profile-cosmetics-modal__head">
            <div>
              <p className="label">Награды и косметика</p>
              <h3>Выбор наград</h3>
            </div>
            <button type="button" className="btn" onClick={onClose}>
              Закрыть
            </button>
          </div>

          {adminPreviewAll ? (
            <p className="profile-cosmetics-modal__preview-note">
              Режим предпросмотра администратора: показаны все награды для проверки интерфейса.
            </p>
          ) : null}

          <div className="profile-cosmetics-modal__preview">
            <UserAvatar
              name={name}
              callsign={callsign}
              avatarUrl={avatarUrl}
              size={72}
              avatarFrame={draftFrame}
            />
            <p className={`profile-cosmetics-modal__preview-name ${finalNameColorClass(draftColor)}`.trim()}>
              {name} {callsign}
            </p>
          </div>

          <section className="profile-cosmetics-section">
            <h4>Подсветка аватара (пробные тесты)</h4>
            {!frames.length ? (
              <p className="page-subtitle">Пока нет доступных рамок.</p>
            ) : (
              <div className="profile-cosmetics-grid">
                <button
                  type="button"
                  className={`profile-cosmetics-option${draftFrame === null ? " is-selected" : ""}`}
                  onClick={() => setDraftFrame(null)}
                >
                  Без рамки
                </button>
                {frames.map((frame) => (
                  <button
                    key={frame}
                    type="button"
                    className={`profile-cosmetics-option profile-cosmetics-option--frame ${trialAvatarFrameClass(frame)}${
                      draftFrame === frame ? " is-selected" : ""
                    }`}
                    onClick={() => setDraftFrame(frame)}
                  >
                    <span className="profile-cosmetics-option__swatch" />
                    {trialFrameLabel(frame)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="profile-cosmetics-section">
            <h4>Цвет имени и позывного (итоговые тесты)</h4>
            {!colors.length ? (
              <p className="page-subtitle">Пока нет доступных цветов.</p>
            ) : (
              <div className="profile-cosmetics-grid">
                <button
                  type="button"
                  className={`profile-cosmetics-option${draftColor === null ? " is-selected" : ""}`}
                  onClick={() => setDraftColor(null)}
                >
                  Обычный
                </button>
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`profile-cosmetics-option${draftColor === color ? " is-selected" : ""}`}
                    onClick={() => setDraftColor(color)}
                  >
                    <span className={`profile-cosmetics-option__sample ${finalNameColorClass(color)}`}>Аа</span>
                    {finalNameColorLabel(color)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="profile-cosmetics-modal__actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => onSave({ avatarFrame: draftFrame, nameColor: draftColor })}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileCosmeticsButton({
  onClick,
  title = "Награды и косметика",
}: {
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="btn profile-hero-edit-btn profile-hero-cosmetics-btn"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.7L12 16.8 6.4 19.5l2.1-6.7L3 8.8h6.8z" />
      </svg>
    </button>
  );
}

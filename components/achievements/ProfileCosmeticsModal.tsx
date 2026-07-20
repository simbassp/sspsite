"use client";

import { useEffect, useState } from "react";
import {
  FINAL_ACHIEVEMENTS,
  TRIAL_ACHIEVEMENTS,
  finalNameColorClass,
  finalNameColorLabel,
  trialAvatarFrameClass,
  trialFrameLabel,
  type FinalNameColorId,
  type TrialAvatarFrameId,
} from "@/lib/achievements-catalog";
import { UserAvatar } from "@/components/profile/UserAvatar";

type ProfileCosmeticsModalProps = {
  open: boolean;
  onClose: () => void;
  unlockedIds: string[];
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
    const unlocked = new Set(unlockedIds);
    const frameOk =
      avatarFrame === null ||
      TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === avatarFrame && unlocked.has(item.id));
    const colorOk =
      nameColor === null ||
      FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === nameColor && unlocked.has(item.id));
    setDraftFrame(frameOk ? avatarFrame : null);
    setDraftColor(colorOk ? nameColor : null);
  }, [open, avatarFrame, nameColor, unlockedIds]);

  const unlockedSet = new Set(unlockedIds);

  const selectFrame = (frame: TrialAvatarFrameId | null, unlocked: boolean) => {
    if (!unlocked) return;
    setDraftFrame(frame);
  };

  const selectColor = (color: FinalNameColorId | null, unlocked: boolean) => {
    if (!unlocked) return;
    setDraftColor(color);
  };

  const saveSelection = () => {
    const frameUnlocked =
      draftFrame === null ||
      TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === draftFrame && unlockedSet.has(item.id));
    const colorUnlocked =
      draftColor === null ||
      FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === draftColor && unlockedSet.has(item.id));
    onSave({
      avatarFrame: frameUnlocked ? draftFrame : null,
      nameColor: colorUnlocked ? draftColor : null,
    });
  };

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
            <div className="profile-cosmetics-grid">
              <button
                type="button"
                className={`profile-cosmetics-option${draftFrame === null ? " is-selected" : ""}`}
                onClick={() => selectFrame(null, true)}
              >
                Без рамки
              </button>
              {TRIAL_ACHIEVEMENTS.map((item) => {
                const frame = item.trialFrame;
                if (!frame) return null;
                const unlocked = unlockedSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!unlocked}
                    title={unlocked ? item.description : `${item.description} — не открыто`}
                    aria-disabled={!unlocked}
                    className={`profile-cosmetics-option profile-cosmetics-option--frame ${trialAvatarFrameClass(frame)}${
                      draftFrame === frame && unlocked ? " is-selected" : ""
                    }${unlocked ? "" : " is-locked"}`}
                    onClick={() => selectFrame(frame, unlocked)}
                  >
                    <span className="profile-cosmetics-option__swatch" />
                    <span className="profile-cosmetics-option__label">{trialFrameLabel(frame)}</span>
                    {!unlocked ? <span className="profile-cosmetics-option__hint">{item.title}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="profile-cosmetics-section">
            <h4>Цвет имени и позывного (итоговые тесты)</h4>
            <div className="profile-cosmetics-grid">
              <button
                type="button"
                className={`profile-cosmetics-option${draftColor === null ? " is-selected" : ""}`}
                onClick={() => selectColor(null, true)}
              >
                Обычный
              </button>
              {FINAL_ACHIEVEMENTS.map((item) => {
                const color = item.finalNameColor;
                if (!color) return null;
                const unlocked = unlockedSet.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!unlocked}
                    title={unlocked ? item.description : `${item.description} — не открыто`}
                    aria-disabled={!unlocked}
                    className={`profile-cosmetics-option${draftColor === color && unlocked ? " is-selected" : ""}${
                      unlocked ? "" : " is-locked"
                    }`}
                    onClick={() => selectColor(color, unlocked)}
                  >
                    <span className={`profile-cosmetics-option__sample ${finalNameColorClass(color)}`}>Аа</span>
                    <span className="profile-cosmetics-option__label">{finalNameColorLabel(color)}</span>
                    {!unlocked ? <span className="profile-cosmetics-option__hint">{item.title}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="profile-cosmetics-modal__actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={saveSelection}
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

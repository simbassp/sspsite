"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BANK_ACHIEVEMENTS,
  FINAL_ACHIEVEMENTS,
  TRIAL_ACHIEVEMENTS,
  bankAvatarOverlayClass,
  bankOverlayLabel,
  finalNameColorClass,
  finalNameColorLabel,
  trialAvatarFrameClass,
  trialFrameLabel,
  type BankAvatarOverlayId,
  type FinalNameColorId,
  type TrialAvatarFrameId,
} from "@/lib/achievements-catalog";
import { UserAvatar } from "@/components/profile/UserAvatar";

type LockedTip = {
  title: string;
  body: string;
};

type ProfileCosmeticsModalProps = {
  open: boolean;
  onClose: () => void;
  unlockedIds: string[];
  name: string;
  callsign: string;
  avatarUrl: string | null;
  avatarFrame: TrialAvatarFrameId | null;
  bankOverlay: BankAvatarOverlayId | null;
  nameColor: FinalNameColorId | null;
  onSave: (next: {
    avatarFrame: TrialAvatarFrameId | null;
    bankOverlay: BankAvatarOverlayId | null;
    nameColor: FinalNameColorId | null;
  }) => void;
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
  bankOverlay,
  nameColor,
  onSave,
  saving = false,
}: ProfileCosmeticsModalProps) {
  const [draftFrame, setDraftFrame] = useState<TrialAvatarFrameId | null>(avatarFrame);
  const [draftBankOverlay, setDraftBankOverlay] = useState<BankAvatarOverlayId | null>(bankOverlay);
  const [draftColor, setDraftColor] = useState<FinalNameColorId | null>(nameColor);
  const [previewFrame, setPreviewFrame] = useState<TrialAvatarFrameId | null>(avatarFrame);
  const [previewBankOverlay, setPreviewBankOverlay] = useState<BankAvatarOverlayId | null>(bankOverlay);
  const [previewColor, setPreviewColor] = useState<FinalNameColorId | null>(nameColor);
  const [lockedTip, setLockedTip] = useState<LockedTip | null>(null);

  const unlockedSet = useMemo(() => new Set(unlockedIds), [unlockedIds]);

  useEffect(() => {
    if (!open) return;
    const frameOk =
      avatarFrame === null ||
      TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === avatarFrame && unlockedSet.has(item.id));
    const bankOk =
      bankOverlay === null ||
      BANK_ACHIEVEMENTS.some((item) => item.bankOverlay === bankOverlay && unlockedSet.has(item.id));
    const colorOk =
      nameColor === null ||
      FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === nameColor && unlockedSet.has(item.id));
    const nextFrame = frameOk ? avatarFrame : null;
    const nextBankOverlay = bankOk ? bankOverlay : null;
    const nextColor = colorOk ? nameColor : null;
    setDraftFrame(nextFrame);
    setDraftBankOverlay(nextBankOverlay);
    setDraftColor(nextColor);
    setPreviewFrame(nextFrame);
    setPreviewBankOverlay(nextBankOverlay);
    setPreviewColor(nextColor);
    setLockedTip(null);
  }, [open, avatarFrame, bankOverlay, nameColor, unlockedIds, unlockedSet]);

  const previewFrameLocked =
    previewFrame != null &&
    !TRIAL_ACHIEVEMENTS.some((item) => item.trialFrame === previewFrame && unlockedSet.has(item.id));
  const previewBankOverlayLocked =
    previewBankOverlay != null &&
    !BANK_ACHIEVEMENTS.some((item) => item.bankOverlay === previewBankOverlay && unlockedSet.has(item.id));
  const previewColorLocked =
    previewColor != null &&
    !FINAL_ACHIEVEMENTS.some((item) => item.finalNameColor === previewColor && unlockedSet.has(item.id));
  const isLockedPreview = previewFrameLocked || previewBankOverlayLocked || previewColorLocked;

  const selectFrame = (frame: TrialAvatarFrameId | null, unlocked: boolean, tip?: LockedTip) => {
    setPreviewFrame(frame);
    if (!unlocked) {
      if (tip) setLockedTip(tip);
      return;
    }
    setLockedTip(null);
    setDraftFrame(frame);
  };

  const selectBankOverlay = (overlay: BankAvatarOverlayId | null, unlocked: boolean, tip?: LockedTip) => {
    setPreviewBankOverlay(overlay);
    if (!unlocked) {
      if (tip) setLockedTip(tip);
      return;
    }
    setLockedTip(null);
    setDraftBankOverlay(overlay);
  };

  const selectColor = (color: FinalNameColorId | null, unlocked: boolean, tip?: LockedTip) => {
    setPreviewColor(color);
    if (!unlocked) {
      if (tip) setLockedTip(tip);
      return;
    }
    setLockedTip(null);
    setDraftColor(color);
  };

  const saveSelection = () => {
    onSave({
      avatarFrame: draftFrame,
      bankOverlay: draftBankOverlay,
      nameColor: draftColor,
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

          <div
            className={`profile-cosmetics-modal__preview${isLockedPreview ? " is-locked-preview" : ""}`}
          >
            <UserAvatar
              name={name}
              callsign={callsign}
              avatarUrl={avatarUrl}
              size={72}
              avatarFrame={previewFrame}
              bankOverlay={previewBankOverlay}
            />
            <div className="profile-cosmetics-modal__preview-text">
              <p className={`profile-cosmetics-modal__preview-name ${finalNameColorClass(previewColor)}`.trim()}>
                {name} {callsign}
              </p>
              {isLockedPreview ? (
                <p className="profile-cosmetics-modal__preview-note">Предпросмотр — достижение не открыто</p>
              ) : null}
            </div>
          </div>

          {lockedTip ? (
            <p className="profile-cosmetics-locked-tip" role="status">
              <strong>{lockedTip.title}</strong>
              <span>{lockedTip.body}</span>
            </p>
          ) : null}

          <section className="profile-cosmetics-section">
            <h4>Эффект над аватаром (тест «Весь банк»)</h4>
            <div className="profile-cosmetics-grid">
              <button
                type="button"
                className={`profile-cosmetics-option${
                  previewBankOverlay === null && !previewBankOverlayLocked ? " is-selected" : ""
                }${previewBankOverlay === null && previewBankOverlayLocked ? " is-preview" : ""}`}
                onClick={() => selectBankOverlay(null, true)}
              >
                Без эффекта
              </button>
              {BANK_ACHIEVEMENTS.map((item) => {
                const overlay = item.bankOverlay;
                if (!overlay) return null;
                const unlocked = unlockedSet.has(item.id);
                const tip = { title: item.title, body: item.description };
                const isPreview = previewBankOverlay === overlay;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-disabled={!unlocked}
                    className={`profile-cosmetics-option profile-cosmetics-option--bank ${bankAvatarOverlayClass(overlay)}${
                      unlocked && draftBankOverlay === overlay ? " is-selected" : ""
                    }${!unlocked && isPreview ? " is-preview" : ""}${unlocked ? "" : " is-locked"}`}
                    onClick={() => selectBankOverlay(overlay, unlocked, tip)}
                  >
                    <span className="profile-cosmetics-option__bank-preview">
                      <span className="profile-cosmetics-option__bank-dot" />
                    </span>
                    <span className="profile-cosmetics-option__label">{bankOverlayLabel(overlay)}</span>
                    {!unlocked ? <span className="profile-cosmetics-option__hint">{item.title}</span> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="profile-cosmetics-section">
            <h4>Подсветка аватара (пробные тесты)</h4>
            <div className="profile-cosmetics-grid">
              <button
                type="button"
                className={`profile-cosmetics-option${
                  previewFrame === null && !previewFrameLocked ? " is-selected" : ""
                }${previewFrame === null && previewFrameLocked ? " is-preview" : ""}`}
                onClick={() => selectFrame(null, true)}
              >
                Без рамки
              </button>
              {TRIAL_ACHIEVEMENTS.map((item) => {
                const frame = item.trialFrame;
                if (!frame) return null;
                const unlocked = unlockedSet.has(item.id);
                const tip = { title: item.title, body: item.description };
                const isPreview = previewFrame === frame;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-disabled={!unlocked}
                    className={`profile-cosmetics-option profile-cosmetics-option--frame ${trialAvatarFrameClass(frame)}${
                      unlocked && draftFrame === frame ? " is-selected" : ""
                    }${!unlocked && isPreview ? " is-preview" : ""}${unlocked ? "" : " is-locked"}`}
                    onClick={() => selectFrame(frame, unlocked, tip)}
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
                className={`profile-cosmetics-option${
                  previewColor === null && !previewColorLocked ? " is-selected" : ""
                }${previewColor === null && previewColorLocked ? " is-preview" : ""}`}
                onClick={() => selectColor(null, true)}
              >
                Обычный
              </button>
              {FINAL_ACHIEVEMENTS.map((item) => {
                const color = item.finalNameColor;
                if (!color) return null;
                const unlocked = unlockedSet.has(item.id);
                const tip = { title: item.title, body: item.description };
                const isPreview = previewColor === color;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-disabled={!unlocked}
                    className={`profile-cosmetics-option${unlocked && draftColor === color ? " is-selected" : ""}${
                      !unlocked && isPreview ? " is-preview" : ""
                    }${unlocked ? "" : " is-locked"}`}
                    onClick={() => selectColor(color, unlocked, tip)}
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

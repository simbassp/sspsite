"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_AVATAR_CROP,
  loadImageFromFile,
  renderAvatarBlob,
  type AvatarCropState,
} from "@/lib/avatar-crop-client";
import { UserAvatar } from "@/components/profile/UserAvatar";

const PREVIEW_SIZE = 168;
const DRAG_SENSITIVITY = 1;

type AvatarCropFieldProps = {
  name: string;
  callsign: string;
  currentAvatarUrl?: string | null;
  disabled?: boolean;
  onPendingChange: (payload: { blob: Blob | null; remove: boolean } | null) => void;
};

export function AvatarCropField({
  name,
  callsign,
  currentAvatarUrl = null,
  disabled = false,
  onPendingChange,
}: AvatarCropFieldProps) {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<AvatarCropState>(DEFAULT_AVATAR_CROP);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [error, setError] = useState("");
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const displayAvatarUrl = removeRequested ? null : currentAvatarUrl;

  const refreshPreview = useCallback(async () => {
    if (!sourceImage) {
      setPreviewUrl(null);
      onPendingChange(null);
      return;
    }
    try {
      const blob = await renderAvatarBlob(sourceImage, crop, 256);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      onPendingChange({ blob, remove: false });
      setRemoveRequested(false);
      setError("");
    } catch {
      setError("Не удалось подготовить предпросмотр.");
      onPendingChange(null);
    }
  }, [crop, onPendingChange, sourceImage]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const onPickFile = async (file: File | null) => {
    if (!file || disabled) return;
    setError("");
    try {
      const image = await loadImageFromFile(file);
      setSourceImage(image);
      setCrop(DEFAULT_AVATAR_CROP);
      setRemoveRequested(false);
    } catch {
      setError("Не удалось открыть файл. Выберите JPEG или PNG.");
    }
  };

  const onRemove = () => {
    if (disabled) return;
    setSourceImage(null);
    setCrop(DEFAULT_AVATAR_CROP);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRemoveRequested(true);
    onPendingChange({ blob: null, remove: true });
    setError("");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!sourceImage || disabled) return;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !sourceImage || disabled) return;
    const dx = (event.clientX - dragRef.current.x) * DRAG_SENSITIVITY;
    const dy = (event.clientY - dragRef.current.y) * DRAG_SENSITIVITY;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY };
    setCrop((prev) => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cropPreviewStyle = useMemo(() => {
    if (!sourceImage) return undefined;
    const baseScale = Math.max(PREVIEW_SIZE / sourceImage.width, PREVIEW_SIZE / sourceImage.height);
    const scale = baseScale * crop.zoom;
    const drawW = sourceImage.width * scale;
    const drawH = sourceImage.height * scale;
    const x = (PREVIEW_SIZE - drawW) / 2 + crop.offsetX;
    const y = (PREVIEW_SIZE - drawH) / 2 + crop.offsetY;
    return {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: drawW,
      height: drawH,
      transform: `translate(${x}px, ${y}px)`,
      maxWidth: "none",
    };
  }, [crop.offsetX, crop.offsetY, crop.zoom, sourceImage]);

  const pendingPreviewUrl = previewUrl;

  return (
    <div className="avatar-crop-field">
      <p className="label" style={{ marginBottom: 8 }}>
        Фото профиля
      </p>
      <div className="avatar-crop-field__previews">
        <div className="avatar-crop-field__editor">
          <div
            className={`avatar-crop-field__viewport${sourceImage ? " is-editable" : ""}`}
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {sourceImage && cropPreviewStyle ? (
              <img
                src={sourceImage.src}
                alt=""
                className="avatar-crop-field__source"
                style={cropPreviewStyle}
                draggable={false}
              />
            ) : pendingPreviewUrl ? (
              <img src={pendingPreviewUrl} alt="" className="avatar-crop-field__ready" draggable={false} />
            ) : (
              <UserAvatar name={name} callsign={callsign} avatarUrl={displayAvatarUrl} size={PREVIEW_SIZE} />
            )}
          </div>
          <p className="page-subtitle avatar-crop-field__hint">
            {sourceImage ? "Перетащите фото и отрегулируйте масштаб." : "Так будет выглядеть аватар в профиле."}
          </p>
        </div>
        <div className="avatar-crop-field__samples">
          <div className="avatar-crop-field__sample">
            <UserAvatar
              name={name}
              callsign={callsign}
              avatarUrl={pendingPreviewUrl ? pendingPreviewUrl : displayAvatarUrl}
              size={64}
            />
            <span>Профиль</span>
          </div>
          <div className="avatar-crop-field__sample">
            <UserAvatar
              name={name}
              callsign={callsign}
              avatarUrl={pendingPreviewUrl ? pendingPreviewUrl : displayAvatarUrl}
              size={34}
            />
            <span>Новости</span>
          </div>
        </div>
      </div>

      <div className="avatar-crop-field__controls">
        <label className="btn avatar-crop-field__file-btn">
          Выбрать фото
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={disabled}
            hidden
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {(currentAvatarUrl || pendingPreviewUrl) && !removeRequested ? (
          <button type="button" className="btn" disabled={disabled} onClick={onRemove}>
            Удалить фото
          </button>
        ) : null}
      </div>

      {sourceImage ? (
        <label className="avatar-crop-field__zoom">
          <span>Масштаб</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={crop.zoom}
            disabled={disabled}
            onChange={(e) => setCrop((prev) => ({ ...prev, zoom: Number(e.target.value) }))}
          />
        </label>
      ) : null}

      {!!error && (
        <p className="page-subtitle" style={{ margin: 0, color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

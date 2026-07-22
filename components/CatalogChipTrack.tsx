"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type CatalogChipTrackProps = {
  activeId: string | null;
  className?: string;
  children: ReactNode;
};

export function CatalogChipTrack({ activeId, className, children }: CatalogChipTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [slider, setSlider] = useState({ width: 0, x: 0 });

  const syncSlider = useCallback(() => {
    const track = trackRef.current;
    if (!track || !activeId) {
      setSlider({ width: 0, x: 0 });
      return;
    }
    const active = track.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(activeId)}"]`);
    if (!active) {
      setSlider({ width: 0, x: 0 });
      return;
    }
    setSlider({ width: active.offsetWidth, x: active.offsetLeft });
    active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  useEffect(() => {
    const frame = requestAnimationFrame(syncSlider);
    const track = trackRef.current;
    if (!track) return () => cancelAnimationFrame(frame);

    const onScroll = () => {
      if (!activeId) return;
      const active = track.querySelector<HTMLElement>(`[data-chip-id="${CSS.escape(activeId)}"]`);
      if (!active) return;
      setSlider({ width: active.offsetWidth, x: active.offsetLeft });
    };

    window.addEventListener("resize", syncSlider);
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", syncSlider);
      track.removeEventListener("scroll", onScroll);
    };
  }, [activeId, syncSlider]);

  return (
    <div className={`chips chip-track${className ? ` ${className}` : ""}`} ref={trackRef}>
      <span
        className="chip-track__slider"
        aria-hidden
        style={{
          width: slider.width ? `${slider.width}px` : 0,
          transform: `translateX(${slider.x}px)`,
          opacity: slider.width ? 1 : 0,
        }}
      />
      {children}
    </div>
  );
}

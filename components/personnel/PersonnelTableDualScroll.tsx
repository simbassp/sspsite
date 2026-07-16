"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function PersonnelTableDualScroll({ children }: { children: ReactNode }) {
  const topRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = topRef.current;
    const main = mainRef.current;
    const spacer = spacerRef.current;
    const content = contentRef.current;
    if (!top || !main || !spacer || !content) return;

    let syncing = false;
    const syncScroll = (source: HTMLDivElement, target: HTMLDivElement) => {
      if (syncing) return;
      syncing = true;
      target.scrollLeft = source.scrollLeft;
      syncing = false;
    };

    const onTopScroll = () => syncScroll(top, main);
    const onMainScroll = () => syncScroll(main, top);
    top.addEventListener("scroll", onTopScroll, { passive: true });
    main.addEventListener("scroll", onMainScroll, { passive: true });

    const updateWidth = () => {
      spacer.style.width = `${content.scrollWidth}px`;
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(content);

    return () => {
      top.removeEventListener("scroll", onTopScroll);
      main.removeEventListener("scroll", onMainScroll);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="personnel-table-dual-scroll">
      <div ref={topRef} className="personnel-table-scroll personnel-table-scroll--top" aria-hidden>
        <div ref={spacerRef} className="personnel-table-scroll__spacer" />
      </div>
      <div ref={mainRef} className="personnel-table-scroll personnel-table-scroll--main">
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  );
}

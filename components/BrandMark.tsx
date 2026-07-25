type BrandMarkProps = {
  className?: string;
};

/** Логотип в красном квадрате — щит с прицелом (ПВО). */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div className={`brand-mark${className ? ` ${className}` : ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 2.75L19 6.2v5.55c0 4.65-3.1 8.55-7 10.2-3.9-1.65-7-5.55-7-10.2V6.2L12 2.75Z"
          fill="rgba(255,255,255,0.14)"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11.5" r="4.25" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="11.5" r="1.35" fill="currentColor" />
        <path d="M12 6.5v2.2M12 14.3v2.2M7.75 11.5h2.2M14.05 11.5h2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M12 4.8v1.1M16.2 7.1l-.78.78M19.2 11.5h-1.1M16.2 15.9l-.78-.78M12 18.2v-1.1M7.8 15.9l.78-.78M4.8 11.5h1.1M7.8 7.1l.78.78"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}

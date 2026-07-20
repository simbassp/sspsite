import { bankAvatarOverlayClass, type BankAvatarOverlayId } from "@/lib/achievements-catalog";

type AvatarBankOverlayProps = {
  overlay: BankAvatarOverlayId;
  size?: number;
  className?: string;
};

export function AvatarBankOverlay({ overlay, size = 64, className = "" }: AvatarBankOverlayProps) {
  const scale = Math.max(0.55, Math.min(1.35, size / 64));
  return (
    <span
      className={`${bankAvatarOverlayClass(overlay)} ${className}`.trim()}
      aria-hidden="true"
      style={{ ["--bank-overlay-scale" as string]: scale }}
    >
      {overlay === "bank-overlay-flame" ? <span className="avatar-bank-overlay__flame" /> : null}
      {overlay === "bank-overlay-crown" ? <span className="avatar-bank-overlay__crown" /> : null}
      {overlay === "bank-overlay-diamond" ? <span className="avatar-bank-overlay__diamond" /> : null}
      {overlay === "bank-overlay-aurora-flame" ? <span className="avatar-bank-overlay__aurora-flame" /> : null}
      {overlay === "bank-overlay-geran" ? <span className="avatar-bank-overlay__geran" /> : null}
    </span>
  );
}

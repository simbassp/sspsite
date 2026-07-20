import { bankAvatarOverlayClass, bankOverlayGemClass, bankOverlayOrbitClass, type BankAvatarOverlayId } from "@/lib/achievements-catalog";

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
      <span className={bankOverlayOrbitClass(overlay)} />
      <span className={bankOverlayGemClass(overlay)}>
        <span className="avatar-bank-overlay__gem-glow" />
        <span className="avatar-bank-overlay__gem-body" />
        <span className="avatar-bank-overlay__gem-shine" />
      </span>
    </span>
  );
}

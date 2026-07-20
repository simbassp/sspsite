import { bankAvatarOverlayClass, type BankAvatarOverlayId } from "@/lib/achievements-catalog";

type AvatarBankOverlayProps = {
  overlay: BankAvatarOverlayId;
  size?: number;
  className?: string;
};

function Ember({ className }: { className: string }) {
  return <span className={`avatar-bank-overlay__ember ${className}`.trim()} />;
}

function WrapFire({ variant }: { variant: "fire" | "aurora" }) {
  const root = variant === "fire" ? "avatar-bank-overlay__wrap-fire" : "avatar-bank-overlay__wrap-aurora";
  return (
    <span className={root}>
      <span className={`${root}__ring`} />
      <span className={`${root}__sheet ${root}__sheet--left`} />
      <span className={`${root}__sheet ${root}__sheet--right`} />
      <span className={`${root}__crest`} />
      <Ember className={`${root}__ember ${root}__ember--1`} />
      <Ember className={`${root}__ember ${root}__ember--2`} />
      <Ember className={`${root}__ember ${root}__ember--3`} />
      <Ember className={`${root}__ember ${root}__ember--4`} />
    </span>
  );
}

function SlimeLayers() {
  return (
    <span className="avatar-bank-overlay__slime">
      <span className="avatar-bank-overlay__slime-side avatar-bank-overlay__slime-side--left" />
      <span className="avatar-bank-overlay__slime-side avatar-bank-overlay__slime-side--right" />
      <span className="avatar-bank-overlay__slime-pool" />
      <span className="avatar-bank-overlay__slime-drip avatar-bank-overlay__slime-drip--1" />
      <span className="avatar-bank-overlay__slime-drip avatar-bank-overlay__slime-drip--2" />
      <span className="avatar-bank-overlay__slime-drip avatar-bank-overlay__slime-drip--3" />
    </span>
  );
}

function DiamondLayers() {
  return (
    <span className="avatar-bank-overlay__diamond-wrap">
      <span className="avatar-bank-overlay__diamond-ring" />
      <span className="avatar-bank-overlay__diamond-prism" />
      <span className="avatar-bank-overlay__diamond-gem" />
      <span className="avatar-bank-overlay__diamond-shimmer avatar-bank-overlay__diamond-shimmer--1" />
      <span className="avatar-bank-overlay__diamond-shimmer avatar-bank-overlay__diamond-shimmer--2" />
    </span>
  );
}

function MegaCrownLayers() {
  return (
    <span className="avatar-bank-overlay__mega-crown">
      <span className="avatar-bank-overlay__mega-crown__aura" />
      <span className="avatar-bank-overlay__mega-crown__band" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--1" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--2" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--3" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--4" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--5" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--6" />
      <span className="avatar-bank-overlay__mega-crown__peak avatar-bank-overlay__mega-crown__peak--7" />
      <span className="avatar-bank-overlay__mega-crown__shine" />
    </span>
  );
}

export function AvatarBankOverlay({ overlay, size = 64, className = "" }: AvatarBankOverlayProps) {
  const scale = Math.max(0.55, Math.min(1.35, size / 64));
  return (
    <span
      className={`${bankAvatarOverlayClass(overlay)} ${className}`.trim()}
      aria-hidden="true"
      style={{ ["--bank-overlay-scale" as string]: scale }}
    >
      {overlay === "bank-overlay-flame" ? <WrapFire variant="fire" /> : null}
      {overlay === "bank-overlay-crown" ? <SlimeLayers /> : null}
      {overlay === "bank-overlay-diamond" ? <DiamondLayers /> : null}
      {overlay === "bank-overlay-aurora-flame" ? <WrapFire variant="aurora" /> : null}
      {overlay === "bank-overlay-geran" ? <MegaCrownLayers /> : null}
    </span>
  );
}

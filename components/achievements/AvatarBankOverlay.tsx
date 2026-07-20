import { bankAvatarOverlayClass, type BankAvatarOverlayId } from "@/lib/achievements-catalog";

type AvatarBankOverlayProps = {
  overlay: BankAvatarOverlayId;
  size?: number;
  className?: string;
};

function FlameLayers({ variant }: { variant: "fire" | "aurora" }) {
  const rootClass =
    variant === "fire" ? "avatar-bank-overlay__flame" : "avatar-bank-overlay__aurora-flame";
  return (
    <span className={rootClass}>
      <span className={`${rootClass}-layer ${rootClass}-layer--back`} />
      <span className={`${rootClass}-layer ${rootClass}-layer--mid`} />
      <span className={`${rootClass}-layer ${rootClass}-layer--core`} />
      <span className={`${rootClass}-tongue ${rootClass}-tongue--left`} />
      <span className={`${rootClass}-tongue ${rootClass}-tongue--right`} />
      <span className={`${rootClass}-tongue ${rootClass}-tongue--center`} />
    </span>
  );
}

function CrownLayers({ variant }: { variant: "royal" | "mega" }) {
  const rootClass = variant === "mega" ? "avatar-bank-overlay__mega-crown" : "avatar-bank-overlay__crown";
  return (
    <span className={rootClass}>
      <span className={`${rootClass}__band`} />
      <span className={`${rootClass}__peak ${rootClass}__peak--1`} />
      <span className={`${rootClass}__peak ${rootClass}__peak--2`} />
      <span className={`${rootClass}__peak ${rootClass}__peak--3`} />
      <span className={`${rootClass}__peak ${rootClass}__peak--4`} />
      <span className={`${rootClass}__peak ${rootClass}__peak--5`} />
      {variant === "mega" ? (
        <>
          <span className={`${rootClass}__peak ${rootClass}__peak--6`} />
          <span className={`${rootClass}__peak ${rootClass}__peak--7`} />
        </>
      ) : null}
      <span className={`${rootClass}__shine`} />
    </span>
  );
}

function DiamondLayers() {
  return (
    <span className="avatar-bank-overlay__diamond">
      <span className="avatar-bank-overlay__diamond-glow" />
      <span className="avatar-bank-overlay__diamond-body" />
      <span className="avatar-bank-overlay__diamond-facet avatar-bank-overlay__diamond-facet--left" />
      <span className="avatar-bank-overlay__diamond-facet avatar-bank-overlay__diamond-facet--right" />
      <span className="avatar-bank-overlay__diamond-spark avatar-bank-overlay__diamond-spark--1" />
      <span className="avatar-bank-overlay__diamond-spark avatar-bank-overlay__diamond-spark--2" />
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
      {overlay === "bank-overlay-flame" ? <FlameLayers variant="fire" /> : null}
      {overlay === "bank-overlay-crown" ? <CrownLayers variant="royal" /> : null}
      {overlay === "bank-overlay-diamond" ? <DiamondLayers /> : null}
      {overlay === "bank-overlay-aurora-flame" ? <FlameLayers variant="aurora" /> : null}
      {overlay === "bank-overlay-geran" ? <CrownLayers variant="mega" /> : null}
    </span>
  );
}

import type { PersonnelExamType } from "@/lib/personnel-catalog";

const svgBase = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconDays({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconRank({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M12 2 4 7v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V7l-8-5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconCalendarRange({ size = 18 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconCar({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M5 17h14v-5l-2-5H7l-2 5v5Z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </svg>
  );
}

export function IconMedal({ size = 24 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <circle cx="12" cy="8" r="5" />
      <path d="M8.5 14 6 22l6-3 6 3-2.5-8" />
    </svg>
  );
}

export function IconPremium({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function IconDeployment({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconUavHit({ size = 20 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

export function IconLicense({ label }: { label: string }) {
  return (
    <span className="personnel-license-badge" title={`Категория ${label}`}>
      {label}
    </span>
  );
}

export function ExamStatusIcon({ passed }: { passed: boolean }) {
  if (passed) {
    return (
      <svg {...svgBase} className="personnel-exam-icon personnel-exam-icon--ok" aria-hidden>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg {...svgBase} className="personnel-exam-icon personnel-exam-icon--bad" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconExamTtx({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function IconExamMedicine({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M12 6v12" />
      <path d="M6 12h12" />
      <rect x="4" y="4" width="16" height="16" rx="4" />
    </svg>
  );
}

export function IconExamVerification({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M12 3 4 7v6c0 4 3.5 6.5 8 8 4.5-1.5 8-4 8-8V7l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconExamPhysical({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <path d="M6.5 9.5 4 12l2.5 2.5" />
      <path d="M17.5 9.5 20 12l-2.5 2.5" />
      <path d="M4 12h16" />
      <rect x="8" y="10" width="8" height="4" rx="1" />
    </svg>
  );
}

export function IconExamShooting({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgBase} width={size} height={size} aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

export function ExamTypeIcon({ type, size = 22 }: { type: PersonnelExamType; size?: number }) {
  switch (type) {
    case "ttx":
      return <IconExamTtx size={size} />;
    case "medicine":
      return <IconExamMedicine size={size} />;
    case "verification":
      return <IconExamVerification size={size} />;
    case "physical":
      return <IconExamPhysical size={size} />;
    case "shooting":
      return <IconExamShooting size={size} />;
    default:
      return <IconExamTtx size={size} />;
  }
}

export function examTypeIconTone(type: PersonnelExamType): "blue" | "red" | "green" | "purple" | "orange" {
  switch (type) {
    case "ttx":
      return "blue";
    case "medicine":
      return "red";
    case "verification":
      return "purple";
    case "physical":
      return "green";
    case "shooting":
      return "orange";
    default:
      return "blue";
  }
}

export function examTypeShortLabel(type: PersonnelExamType) {
  switch (type) {
    case "ttx":
      return "ТТХ";
    case "medicine":
      return "Мед";
    case "verification":
      return "ЗУ";
    case "physical":
      return "Физо";
    case "shooting":
      return "Стр";
    default:
      return type;
  }
}

export function PersonnelBarChart({ data }: { data: Array<{ month: string; days: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.days));
  return (
    <div className="personnel-bar-chart" aria-label="Активность по месяцам">
      {data.map((item) => (
        <div key={item.month} className="personnel-bar-chart__col">
          <div
            className="personnel-bar-chart__bar"
            style={{ height: `${Math.max(8, (item.days / max) * 100)}%` }}
            title={`${item.month}: ${item.days} дн.`}
          />
          <span>{item.month}</span>
        </div>
      ))}
    </div>
  );
}

export function PersonnelPieChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0;
  const colors = ["#c42b2b", "#3b82f6", "#10b981", "#f59e0b"];
  const stops = data.map((d, i) => {
    const start = (acc / total) * 100;
    acc += d.value;
    const end = (acc / total) * 100;
    return `${colors[i % colors.length]} ${start}% ${end}%`;
  });
  return (
    <div className="personnel-pie-wrap">
      <div
        className="personnel-pie-chart"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
        aria-hidden
      />
      <ul className="personnel-pie-legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span style={{ background: colors[i % colors.length] }} />
            {d.label} ({d.value})
          </li>
        ))}
      </ul>
    </div>
  );
}

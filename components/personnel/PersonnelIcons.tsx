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

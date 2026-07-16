import sharp from "sharp";

export type ExcelChartSlice = {
  label: string;
  value: number;
  color: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(label: string, max = 22) {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

export function buildPieChartSvg(title: string, slices: ExcelChartSlice[]) {
  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);
  const width = 560;
  const height = 320;
  const cx = 150;
  const cy = 160;
  const radius = 110;

  let arcs = "";
  if (total <= 0) {
    arcs = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#E5E7EB" />`;
  } else {
    let angle = 0;
    for (const slice of positive) {
      const sweep = (slice.value / total) * 360;
      if (sweep >= 359.99) {
        arcs += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${slice.color}" />`;
        break;
      }
      arcs += `<path d="${describeArc(cx, cy, radius, angle, angle + sweep)}" fill="${slice.color}" />`;
      angle += sweep;
    }
    arcs += `<circle cx="${cx}" cy="${cy}" r="42" fill="#FFFFFF" />`;
  }

  const legendStartY = 52;
  const legend = positive.length
    ? positive
        .map((slice, index) => {
          const y = legendStartY + index * 24;
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
          return `
            <rect x="300" y="${y - 10}" width="14" height="14" rx="3" fill="${slice.color}" />
            <text x="322" y="${y + 1}" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#111827">
              ${escapeXml(truncateLabel(slice.label))} — ${slice.value} (${pct}%)
            </text>
          `;
        })
        .join("")
    : `<text x="300" y="80" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6B7280">Нет данных</text>`;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <text x="24" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">
        ${escapeXml(title)}
      </text>
      ${arcs}
      ${legend}
    </svg>
  `;
}

export function buildBarChartSvg(title: string, items: ExcelChartSlice[], unit = "") {
  const positive = items.filter((s) => s.value > 0);
  const max = positive.reduce((m, s) => Math.max(m, s.value), 0);
  const width = 560;
  const height = Math.max(220, 64 + positive.length * 34);
  const barMaxWidth = 250;
  const labelX = 24;
  const barX = 210;
  const startY = 52;

  const bars = positive.length
    ? positive
        .map((item, index) => {
          const y = startY + index * 34;
          const barWidth = max > 0 ? Math.max(4, Math.round((item.value / max) * barMaxWidth)) : 0;
          return `
            <text x="${labelX}" y="${y + 14}" font-family="Segoe UI, Arial, sans-serif" font-size="13" fill="#374151">
              ${escapeXml(truncateLabel(item.label, 24))}
            </text>
            <rect x="${barX}" y="${y}" width="${barWidth}" height="18" rx="4" fill="${item.color}" />
            <text x="${barX + barWidth + 8}" y="${y + 14}" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#111827">
              ${item.value}${unit ? ` ${escapeXml(unit)}` : ""}
            </text>
          `;
        })
        .join("")
    : `<text x="24" y="80" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#6B7280">Нет данных</text>`;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <text x="24" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">
        ${escapeXml(title)}
      </text>
      ${bars}
    </svg>
  `;
}

export function buildMonthlyBarChartSvg(
  title: string,
  months: Array<{ label: string; value: number }>,
  color = "#C42B2B",
) {
  const items = months.filter((m) => m.value >= 0);
  const max = items.reduce((m, s) => Math.max(m, s.value), 0);
  const width = 560;
  const height = 280;
  const chartLeft = 40;
  const chartBottom = 230;
  const chartHeight = 170;
  const slotWidth = items.length > 0 ? Math.min(36, Math.floor(480 / items.length)) : 36;

  const bars = items
    .map((month, index) => {
      const barHeight = max > 0 ? Math.max(2, Math.round((month.value / max) * chartHeight)) : 0;
      const x = chartLeft + index * slotWidth;
      const y = chartBottom - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${Math.max(12, slotWidth - 8)}" height="${barHeight}" rx="3" fill="${color}" />
        <text x="${x + 6}" y="${chartBottom + 18}" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#6B7280" text-anchor="middle">
          ${escapeXml(month.label)}
        </text>
        <text x="${x + 6}" y="${y - 4}" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#111827" text-anchor="middle">
          ${month.value}
        </text>
      `;
    })
    .join("");

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <text x="24" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#111827">
        ${escapeXml(title)}
      </text>
      <line x1="${chartLeft}" y1="${chartBottom}" x2="520" y2="${chartBottom}" stroke="#E5E7EB" stroke-width="1" />
      ${bars}
    </svg>
  `;
}

export async function svgToPngBuffer(svg: string) {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

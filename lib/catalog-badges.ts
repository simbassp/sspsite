/** Мягкие плашки категорий/типа: фон + цвет текста (светлая и тёмная тема). */

export type SoftBadgeStyle = {
  background: string;
  color: string;
  border: string;
};

const gray: SoftBadgeStyle = {
  background: "color-mix(in srgb, var(--muted) 14%, var(--panel))",
  color: "var(--muted)",
  border: "1px solid color-mix(in srgb, var(--muted) 28%, var(--line))",
};

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

/** Плашки типа/назначения для карточек БПЛА (по подстроке в названии категории). */
export function uavBadgeStyle(label: string): SoftBadgeStyle {
  const n = label.trim().toLowerCase();
  if (!n) return gray;
  if (includesAny(n, ["мультикоптер", "multicopter"])) {
    return {
      background: "rgba(59, 130, 246, 0.14)",
      color: "#2563eb",
      border: "1px solid rgba(59, 130, 246, 0.28)",
    };
  }
  if (includesAny(n, ["крыло"])) {
    return {
      background: "rgba(14, 165, 233, 0.14)",
      color: "#0284c7",
      border: "1px solid rgba(14, 165, 233, 0.28)",
    };
  }
  if (includesAny(n, ["реактивн", "турбореакт"])) {
    return {
      background: "rgba(239, 68, 68, 0.14)",
      color: "#dc2626",
      border: "1px solid rgba(239, 68, 68, 0.28)",
    };
  }
  // «Ударные Эл.» / электрические ударные — до общего «ударн»
  if (includesAny(n, ["ударн"]) && includesAny(n, ["эл", "электр", "fpv"])) {
    return {
      background: "rgba(139, 92, 246, 0.16)",
      color: "#7c3aed",
      border: "1px solid rgba(139, 92, 246, 0.32)",
    };
  }
  if (includesAny(n, ["ударн", "strike"]) && includesAny(n, ["двс"])) {
    return {
      background: "rgba(236, 72, 153, 0.14)",
      color: "#db2777",
      border: "1px solid rgba(236, 72, 153, 0.28)",
    };
  }
  if (includesAny(n, ["ударн", "strike"])) {
    return {
      background: "rgba(236, 72, 153, 0.14)",
      color: "#db2777",
      border: "1px solid rgba(236, 72, 153, 0.28)",
    };
  }
  if (includesAny(n, ["развед", "recon"])) {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#15803d",
      border: "1px solid rgba(34, 197, 94, 0.28)",
    };
  }
  if (includesAny(n, ["fpv"])) {
    return {
      background: "rgba(139, 92, 246, 0.16)",
      color: "#7c3aed",
      border: "1px solid rgba(139, 92, 246, 0.32)",
    };
  }
  if (includesAny(n, ["барраж", "loiter"])) {
    return {
      background: "rgba(249, 115, 22, 0.16)",
      color: "#c2410c",
      border: "1px solid rgba(249, 115, 22, 0.3)",
    };
  }
  return gray;
}

const BADGE_PALETTE: SoftBadgeStyle[] = [
  {
    background: "rgba(59, 130, 246, 0.14)",
    color: "#2563eb",
    border: "1px solid rgba(59, 130, 246, 0.28)",
  },
  {
    background: "rgba(34, 197, 94, 0.14)",
    color: "#15803d",
    border: "1px solid rgba(34, 197, 94, 0.28)",
  },
  {
    background: "rgba(249, 115, 22, 0.16)",
    color: "#c2410c",
    border: "1px solid rgba(249, 115, 22, 0.3)",
  },
  {
    background: "rgba(139, 92, 246, 0.16)",
    color: "#7c3aed",
    border: "1px solid rgba(139, 92, 246, 0.32)",
  },
  {
    background: "rgba(236, 72, 153, 0.14)",
    color: "#be185d",
    border: "1px solid rgba(236, 72, 153, 0.28)",
  },
  {
    background: "rgba(20, 184, 166, 0.14)",
    color: "#0f766e",
    border: "1px solid rgba(20, 184, 166, 0.28)",
  },
  {
    background: "rgba(234, 179, 8, 0.16)",
    color: "#a16207",
    border: "1px solid rgba(234, 179, 8, 0.32)",
  },
  {
    background: "rgba(239, 68, 68, 0.14)",
    color: "#dc2626",
    border: "1px solid rgba(239, 68, 68, 0.28)",
  },
  {
    background: "rgba(14, 165, 233, 0.14)",
    color: "#0284c7",
    border: "1px solid rgba(14, 165, 233, 0.28)",
  },
  {
    background: "rgba(168, 85, 247, 0.14)",
    color: "#7e22ce",
    border: "1px solid rgba(168, 85, 247, 0.28)",
  },
];

function hashPaletteStyle(label: string): SoftBadgeStyle {
  let hash = 0;
  const s = label.trim().toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return BADGE_PALETTE[hash % BADGE_PALETTE.length]!;
}

/** Плашки категорий противодействия. */
export function counteractionBadgeStyle(label: string): SoftBadgeStyle {
  const n = label.trim().toLowerCase();
  if (!n) return gray;

  if (includesAny(n, ["средств", "связ", "радиосвяз", "коммуникац"])) {
    return {
      background: "rgba(59, 130, 246, 0.14)",
      color: "#2563eb",
      border: "1px solid rgba(59, 130, 246, 0.28)",
    };
  }
  if (includesAny(n, ["обнаружен", "радар", "дозор", "развед"])) {
    return {
      background: "rgba(14, 165, 233, 0.14)",
      color: "#0284c7",
      border: "1px solid rgba(14, 165, 233, 0.28)",
    };
  }
  if (includesAny(n, ["оружи", "стрелков", "вооружен"])) {
    return {
      background: "rgba(239, 68, 68, 0.14)",
      color: "#dc2626",
      border: "1px solid rgba(239, 68, 68, 0.28)",
    };
  }
  if (includesAny(n, ["подавлен", "глушил", "jammer"])) {
    return {
      background: "rgba(249, 115, 22, 0.16)",
      color: "#c2410c",
      border: "1px solid rgba(249, 115, 22, 0.3)",
    };
  }
  if (includesAny(n, ["маскировк"])) {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#15803d",
      border: "1px solid rgba(34, 197, 94, 0.28)",
    };
  }
  if (includesAny(n, ["укрыти"])) {
    return {
      background: "rgba(100, 116, 139, 0.16)",
      color: "#475569",
      border: "1px solid rgba(100, 116, 139, 0.3)",
    };
  }
  if (includesAny(n, ["реб", "рэб", "радиоэлектрон", "электронн"])) {
    return {
      background: "rgba(139, 92, 246, 0.16)",
      color: "#7c3aed",
      border: "1px solid rgba(139, 92, 246, 0.32)",
    };
  }
  if (includesAny(n, ["оповещен", "сигнал", "тревог"])) {
    return {
      background: "rgba(234, 179, 8, 0.16)",
      color: "#a16207",
      border: "1px solid rgba(234, 179, 8, 0.32)",
    };
  }
  if (includesAny(n, ["действия", "группы", "атак", "тактик"])) {
    return {
      background: "rgba(236, 72, 153, 0.14)",
      color: "#be185d",
      border: "1px solid rgba(236, 72, 153, 0.28)",
    };
  }
  if (includesAny(n, ["инженерн", "сапёр", "сапер", "фортифик"])) {
    return {
      background: "rgba(20, 184, 166, 0.14)",
      color: "#0f766e",
      border: "1px solid rgba(20, 184, 166, 0.28)",
    };
  }
  if (includesAny(n, ["медицин", "первая помощь", "помощь", "медпункт"])) {
    return {
      background: "rgba(244, 114, 182, 0.16)",
      color: "#be185d",
      border: "1px solid rgba(244, 114, 182, 0.3)",
    };
  }
  if (includesAny(n, ["транспорт", "машин", "техник"])) {
    return {
      background: "rgba(168, 85, 247, 0.14)",
      color: "#7e22ce",
      border: "1px solid rgba(168, 85, 247, 0.28)",
    };
  }
  if (includesAny(n, ["оптик", "прицел", "наблюден"])) {
    return {
      background: "rgba(6, 182, 212, 0.14)",
      color: "#0e7490",
      border: "1px solid rgba(6, 182, 212, 0.28)",
    };
  }

  // Любая своя категория — стабильный цвет по названию, не серый.
  return hashPaletteStyle(n);
}

/** Несколько плашек из поля category, если задано через « / » или «|». */
/** Плашки категорий тактической медицины. */
export function tacticalMedicineBadgeStyle(label: string): SoftBadgeStyle {
  const n = label.trim().toLowerCase();
  if (!n) return gray;
  if (includesAny(n, ["первая", "первая помощь", "санитар"])) {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#16a34a",
      border: "1px solid rgba(34, 197, 94, 0.28)",
    };
  }
  if (includesAny(n, ["кров", "ранен", "травм"])) {
    return {
      background: "rgba(239, 68, 68, 0.14)",
      color: "#dc2626",
      border: "1px solid rgba(239, 68, 68, 0.28)",
    };
  }
  return hashPaletteStyle(n);
}

export function splitCategoryLabels(category: string): string[] {
  return category
    .split(/\s*[/|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function specHasDisplayValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v === "-" || v === "—" || v === "–" || v === "−") return false;
  return true;
}

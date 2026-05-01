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
  if (includesAny(n, ["fpv"])) {
    return {
      background: "rgba(139, 92, 246, 0.16)",
      color: "#7c3aed",
      border: "1px solid rgba(139, 92, 246, 0.32)",
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
  if (includesAny(n, ["барраж", "loiter"])) {
    return {
      background: "rgba(249, 115, 22, 0.16)",
      color: "#c2410c",
      border: "1px solid rgba(249, 115, 22, 0.3)",
    };
  }
  return gray;
}

/** Плашки категорий противодействия. */
export function counteractionBadgeStyle(label: string): SoftBadgeStyle {
  const n = label.trim().toLowerCase();
  if (!n) return gray;
  if (includesAny(n, ["обнаружен", "радар", "дозор"])) {
    return {
      background: "rgba(59, 130, 246, 0.14)",
      color: "#2563eb",
      border: "1px solid rgba(59, 130, 246, 0.28)",
    };
  }
  if (includesAny(n, ["маскировк"])) {
    return {
      background: "rgba(34, 197, 94, 0.14)",
      color: "#15803d",
      border: "1px solid rgba(34, 197, 94, 0.28)",
    };
  }
  if (includesAny(n, ["укрыти", "укрытие"])) {
    return {
      background: "rgba(100, 116, 139, 0.16)",
      color: "#475569",
      border: "1px solid rgba(100, 116, 139, 0.3)",
    };
  }
  if (includesAny(n, ["реб", "рэб", "радиоэлектрон"])) {
    return {
      background: "rgba(139, 92, 246, 0.16)",
      color: "#7c3aed",
      border: "1px solid rgba(139, 92, 246, 0.32)",
    };
  }
  if (includesAny(n, ["оповещен"])) {
    return {
      background: "rgba(249, 115, 22, 0.16)",
      color: "#c2410c",
      border: "1px solid rgba(249, 115, 22, 0.3)",
    };
  }
  if (includesAny(n, ["действия группы", "действия при атак", "атаке", "группы"])) {
    return {
      background: "rgba(236, 72, 153, 0.14)",
      color: "#be185d",
      border: "1px solid rgba(236, 72, 153, 0.28)",
    };
  }
  if (includesAny(n, ["инженерн"])) {
    return {
      background: "rgba(20, 184, 166, 0.14)",
      color: "#0f766e",
      border: "1px solid rgba(20, 184, 166, 0.28)",
    };
  }
  if (includesAny(n, ["медицин", "первая помощь", "помощь"])) {
    return {
      background: "rgba(244, 114, 182, 0.16)",
      color: "#be185d",
      border: "1px solid rgba(244, 114, 182, 0.3)",
    };
  }
  return gray;
}

/** Несколько плашек из поля category, если задано через « / » или «|». */
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

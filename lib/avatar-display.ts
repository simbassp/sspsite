export function normalizeAvatarStoragePath(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("uploads/avatars/")) return trimmed;
  return null;
}

export function resolveAvatarDisplayUrl(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("blob:") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const relative = normalizeAvatarStoragePath(trimmed);
  if (!relative) return null;
  return `/api/public-files/${relative}`;
}

export function getAvatarInitials(name: string, callsign: string) {
  const words = [name.trim(), callsign.trim()].filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

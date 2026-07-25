/** Частично скрывает email для отображения в профиле. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed) return "не определён";
  const at = trimmed.indexOf("@");
  if (at <= 0) return trimmed;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return `${local[0] ?? ""}*${domain}`;
  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}${domain}`;
}

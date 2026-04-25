/**
 * turns `/uploads/...` into `/api/public-files/uploads/...` so files are always
 * served by Next (same behind reverse proxies). External URLs unchanged.
 */
export function publicUploadDisplayUrl(stored: string | undefined | null): string {
  const s = (stored ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/api/public-files/")) return s;
  if (s.startsWith("/")) return `/api/public-files${s}`;
  return `/api/public-files/${s.replace(/^\/+/, "")}`;
}

import { SESSION_COOKIE } from "@/lib/seed";
import { SessionUser } from "@/lib/types";

function toBase64Url(base64: string) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
}

function encodeUtf8(value: string) {
  return encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function decodeUtf8(value: string) {
  const encoded = value
    .split("")
    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
    .join("");
  return decodeURIComponent(encoded);
}

function encode(user: SessionUser) {
  const json = JSON.stringify(user);
  if (typeof window === "undefined") {
    return toBase64Url(Buffer.from(json, "utf-8").toString("base64"));
  }
  return toBase64Url(window.btoa(encodeUtf8(json)));
}

function decode(value: string): SessionUser | null {
  try {
    const base64 = fromBase64Url(value);
    const json =
      typeof window === "undefined"
        ? Buffer.from(base64, "base64").toString("utf-8")
        : decodeUtf8(window.atob(base64));
    return JSON.parse(json) as SessionUser;
  } catch {
    return null;
  }
}

export function serializeSessionCookie(user: SessionUser) {
  return `${SESSION_COOKIE}=${encode(user)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function parseSessionCookie(raw: string | undefined) {
  if (!raw) return null;
  return decode(raw);
}

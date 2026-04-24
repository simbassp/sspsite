"use client";

import { SESSION_COOKIE } from "@/lib/seed";
import { SessionUser } from "@/lib/types";

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return window.atob(padded);
}

export function readClientSession(): SessionUser | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((item) => item.trim());
  const sessionCookie = cookies.find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!sessionCookie) return null;

  const raw = sessionCookie.split("=").slice(1).join("=");
  if (!raw) return null;

  try {
    const decoded = decodeBase64Url(raw);
    return JSON.parse(decoded) as SessionUser;
  } catch {
    return null;
  }
}

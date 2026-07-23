import { NextRequest, NextResponse } from "next/server";
import { parseSessionCookie } from "@/lib/auth";
import { canAccessAdminPanel } from "@/lib/permissions";
import { canAccessGameSection } from "@/lib/game-feature";
import { SESSION_COOKIE } from "@/lib/seed";
import { clearSessionCookie } from "@/lib/auth";
import { isSessionStillValid } from "@/lib/server-session-validation";

const publicPaths = ["/", "/login", "/register", "/reset-password", "/auth/recovery"];

function isRecoveryQuery(searchParams: URLSearchParams) {
  return (
    searchParams.get("type") === "recovery" ||
    searchParams.has("code") ||
    searchParams.has("token_hash") ||
    searchParams.has("token") ||
    (searchParams.has("access_token") && searchParams.has("refresh_token"))
  );
}

function redirectRecoveryTarget(request: NextRequest, targetPath: "/auth/recovery" | "/reset-password") {
  const url = new URL(targetPath, request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const recoverySearch = request.nextUrl.searchParams;
  const isRecoveryLink = isRecoveryQuery(recoverySearch);

  if ((pathname === "/login" || pathname === "/") && isRecoveryLink) {
    const useServerCallback =
      recoverySearch.has("code") || recoverySearch.has("token_hash") || recoverySearch.has("token");
    return redirectRecoveryTarget(request, useServerCallback ? "/auth/recovery" : "/reset-password");
  }

  const isRecoveryOnLogin = pathname === "/login" && isRecoveryLink;
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  let session = parseSessionCookie(raw);
  if (session) {
    const valid = await isSessionStillValid(session);
    if (!valid) {
      session = null;
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.headers.append("Set-Cookie", clearSessionCookie());
      return res;
    }
  }

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isPublic && !isRecoveryOnLogin && pathname !== "/reset-password" && pathname !== "/auth/recovery") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  /** Совпадает с app/(protected)/admin/layout.tsx (в т.ч. право «Список пользователей»). */
  const hasAdminAccess = session ? canAccessAdminPanel(session) : false;

  if (session && pathname.startsWith("/admin") && !hasAdminAccess) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && pathname.startsWith("/game") && !canAccessGameSection(session)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

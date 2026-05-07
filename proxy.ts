import { NextRequest, NextResponse } from "next/server";
import { parseSessionCookie } from "@/lib/auth";
import { canAccessAdminPanel } from "@/lib/permissions";
import { SESSION_COOKIE } from "@/lib/seed";
import { clearSessionCookie } from "@/lib/auth";
import { isSessionStillValid } from "@/lib/server-session-validation";

const publicPaths = ["/login", "/register", "/reset-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const isRecoveryOnLogin =
    pathname === "/login" &&
    (request.nextUrl.searchParams.get("type") === "recovery" ||
      Boolean(request.nextUrl.searchParams.get("code")) ||
      Boolean(request.nextUrl.searchParams.get("token_hash")));
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

  if (session && isPublic && !isRecoveryOnLogin && pathname !== "/reset-password") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  /** Совпадает с app/(protected)/admin/layout.tsx (в т.ч. право «Список пользователей»). */
  const hasAdminAccess = session ? canAccessAdminPanel(session) : false;

  if (session && pathname.startsWith("/admin") && !hasAdminAccess) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

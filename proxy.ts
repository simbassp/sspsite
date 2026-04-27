import { NextRequest, NextResponse } from "next/server";
import { parseSessionCookie } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/seed";

const publicPaths = ["/login", "/register", "/reset-password"];

export function proxy(request: NextRequest) {
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
  const session = parseSessionCookie(raw);

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isPublic && !isRecoveryOnLogin && pathname !== "/reset-password") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const hasAdminAccess = Boolean(
    session &&
      (session.role === "admin" ||
        session.canManageContent === true ||
        session.permissions?.users === true ||
        session.permissions?.results === true ||
        session.permissions?.resetResults === true ||
        session.permissions?.news === true ||
        session.permissions?.tests === true ||
        session.permissions?.uav === true ||
        session.permissions?.counteraction === true),
  );

  if (session && pathname.startsWith("/admin") && !hasAdminAccess) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

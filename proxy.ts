import { NextRequest, NextResponse } from "next/server";
import { parseSessionCookie } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/seed";

const publicPaths = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = parseSessionCookie(raw);

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (session && pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

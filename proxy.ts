import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { serializeSessionCookie, clearSessionCookie } from "@/lib/auth";
import { canAccessAdminPanel } from "@/lib/permissions";
import { canAccessGameSection } from "@/lib/game-feature";
import { createSupabaseAuthClient } from "@/lib/supabase-server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { resolveVerifiedSession } from "@/lib/verified-session";
import type { SessionUser } from "@/lib/types";
import { isRecoveryRequest, needsServerRecoveryExchange } from "@/lib/auth-recovery-server";

const publicPaths = ["/", "/login", "/register", "/reset-password", "/auth/recovery"];

function redirectRecoveryTarget(request: NextRequest, targetPath: "/auth/recovery" | "/reset-password") {
  const url = new URL(targetPath, request.url);
  request.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const { pathname, searchParams } = request.nextUrl;
  if (isRecoveryRequest(pathname, searchParams)) {
    if ((pathname === "/login" || pathname === "/" || pathname === "/reset-password") && needsServerRecoveryExchange(searchParams)) {
      return redirectRecoveryTarget(request, "/auth/recovery");
    }
    return NextResponse.next();
  }

  const refreshed = new Map<string, { name: string; value: string; options: CookieOptions }>();
  let session: SessionUser | null = null;
  try {
    const auth = createSupabaseAuthClient({
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          refreshed.set(cookie.name, cookie);
        }
      },
    });
    session = await resolveVerifiedSession(auth, getServerSupabaseServiceClient());
  } catch {
    session = null;
  }

  // Every return path must preserve refreshed tokens, including redirects.
  function finish(response: NextResponse) {
    refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    // This legacy cookie is a display cache only. Repair it from the verified profile.
    response.headers.append("Set-Cookie", session ? serializeSessionCookie(session) : clearSessionCookie());
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const isPublic = publicPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));
  if (!session && !isPublic) return finish(NextResponse.redirect(new URL("/login", request.url)));
  if (session && isPublic && pathname !== "/reset-password" && pathname !== "/auth/recovery") {
    return finish(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  if (session && pathname.startsWith("/admin") && !canAccessAdminPanel(session)) {
    return finish(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  if (session && pathname.startsWith("/game") && !canAccessGameSection(session)) {
    return finish(NextResponse.redirect(new URL("/dashboard", request.url)));
  }
  return finish(NextResponse.next({ request: { headers: request.headers } }));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

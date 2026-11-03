import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createSupabaseFetch } from "@/lib/supabase-fetch";

/** New client per request: its token storage must never be shared across users. */
export function createSupabaseAuthClient(cookieMethods: CookieMethodsServer) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("missing_supabase_auth_env");
  return createServerClient(url, key, {
    cookies: cookieMethods,
    cookieOptions: { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" },
    global: { fetch: createSupabaseFetch() },
  });
}

export async function getSupabaseServerAuthClient() {
  const store = await cookies();
  return createSupabaseAuthClient({
    getAll: () => store.getAll(),
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Server Components cannot write cookies. proxy.ts refreshes before rendering.
      }
    },
  });
}

import { createClient } from "@supabase/supabase-js";
import { createSupabaseFetch } from "@/lib/supabase-fetch";

export function getServerSupabaseServiceClient(options?: { fetchTimeoutMs?: number }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("missing_service_supabase_env");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseFetch(options?.fetchTimeoutMs) },
  });
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type RecoveryUrlParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
};

export function readRecoveryUrlParams(): RecoveryUrlParams {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, code: null, tokenHash: null, type: null };
  }
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return {
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    code: search.get("code"),
    tokenHash: search.get("token_hash") || search.get("token"),
    type: search.get("type") || hash.get("type"),
  };
}

export function hasRecoveryUrlParams(params: RecoveryUrlParams) {
  return Boolean(
    (params.accessToken && params.refreshToken) ||
      params.code ||
      (params.tokenHash && params.type === "recovery") ||
      params.type === "recovery",
  );
}

/** Отдельный клиент без detectSessionInUrl — иначе hash/query съедаются до обработки страницей. */
let resetClient: SupabaseClient | null = null;

export function getResetPasswordSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase is not configured.");
  }
  if (!resetClient) {
    resetClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return resetClient;
}

export function mapRecoveryLinkError(raw: string) {
  const msg = raw.toLowerCase();
  if (msg.includes("pkce") || msg.includes("code verifier")) {
    return "Откройте ссылку в том же браузере, где запрашивали сброс, или запросите новую ссылку.";
  }
  if (msg.includes("expired") || msg.includes("invalid") || msg.includes("otp")) {
    return "Ссылка устарела или уже использована. Запросите новую.";
  }
  return raw.trim() || "Не удалось подтвердить ссылку сброса.";
}

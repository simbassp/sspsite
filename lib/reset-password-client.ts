import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapRecoveryLinkError } from "@/lib/reset-password-client-errors";

export type { RecoveryUrlParams } from "@/lib/reset-password-client-errors";
export { mapRecoveryLinkError, readRecoveryUrlParams, hasRecoveryUrlParams } from "@/lib/reset-password-client-errors";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function recoveryStorageKey() {
  if (!supabaseUrl) return "sb-recovery-auth";
  try {
    const host = new URL(supabaseUrl).hostname;
    const projectRef = host.split(".")[0] || "recovery";
    return `sb-${projectRef}-recovery-auth`;
  } catch {
    return "sb-recovery-auth";
  }
}

/** Отдельный клиент и storage — не смешиваем с обычным входом. */
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
        storageKey: recoveryStorageKey(),
      },
    });
  }
  return resetClient;
}

export async function confirmRecoverySessionViaApi(params: {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
}) {
  const response = await fetch("/api/auth/recovery/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      code: params.code,
      tokenHash: params.tokenHash,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    ok?: boolean;
    error?: string;
    accessToken?: string;
    refreshToken?: string;
  };

  if (!response.ok || !payload.ok || !payload.accessToken || !payload.refreshToken) {
    throw new Error(mapRecoveryLinkError(payload.error || "recovery_confirm_failed"));
  }

  const supabase = getResetPasswordSupabaseClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error) {
    throw new Error(mapRecoveryLinkError(error.message));
  }
}

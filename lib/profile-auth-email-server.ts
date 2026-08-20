import type { getServerSupabaseServiceClient } from "@/lib/server-supabase";

type ServiceClient = ReturnType<typeof getServerSupabaseServiceClient>;

export async function resolveProfileAuthEmail(
  supabase: ServiceClient,
  input: { userId: string; authUserId?: string | null; login?: string | null },
): Promise<string> {
  const idsToTry = [input.authUserId, input.userId].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const seen = new Set<string>();

  for (const id of idsToTry) {
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      const { data, error } = await supabase.auth.admin.getUserById(id);
      const email = data.user?.email?.trim();
      if (!error && email) return email;
    } catch {
      /* try next */
    }
  }

  const login = input.login?.trim();
  if (login) {
    try {
      const { data, error } = await supabase.rpc("resolve_login_email", { p_login: login });
      if (!error && typeof data === "string" && data.trim()) return data.trim();
    } catch {
      /* ignore */
    }
  }

  return "";
}

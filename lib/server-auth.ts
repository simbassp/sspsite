import { getSupabaseServerAuthClient } from "@/lib/supabase-server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { resolveVerifiedSession } from "@/lib/verified-session";

export async function getServerSession() {
  try {
    return await resolveVerifiedSession(
      await getSupabaseServerAuthClient(),
      getServerSupabaseServiceClient(),
    );
  } catch {
    return null;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError } from "@/lib/server-final-user-context";

/** От большего к меньшему: косметика грузится отдельно, здесь только поля профиля. */
const INSPECT_USER_SELECT_TIERS = [
  "id,name,callsign,position,role,status,login,is_online,last_seen_at,duty_location,unit_assignment,rota_platoon,rota_section,avatar_url,profile_name_color",
  "id,name,callsign,position,role,status,login,is_online,last_seen_at,duty_location,unit_assignment,rota_platoon,rota_section,avatar_url",
  "id,name,callsign,position,role,status,login,is_online,duty_location,unit_assignment,rota_platoon,rota_section",
  "id,name,callsign,position,role,status,login,is_online,last_seen_at,duty_location,unit_assignment,rota_platoon,rota_section",
  "id,name,callsign,position,role,status,login,is_online,duty_location,unit_assignment,rota_platoon,rota_section",
  "id,name,callsign,position,role,status,login,is_online",
] as const;

export type InspectUserRowLoadResult =
  | {
      ok: true;
      row: Record<string, unknown>;
      dutyFromDb: boolean;
      unitFromDb: boolean;
      onlineFromFlagOnly: boolean;
    }
  | { ok: false; error: string };

function tierFlags(select: string) {
  return {
    dutyFromDb: select.includes("duty_location"),
    unitFromDb: select.includes("unit_assignment"),
    onlineFromFlagOnly: !select.includes("last_seen_at"),
  };
}

export async function loadInspectUserRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<InspectUserRowLoadResult> {
  let lastError = "profile_user_load_failed";

  for (const select of INSPECT_USER_SELECT_TIERS) {
    const res = await supabase.from("app_users").select(select).eq("id", userId).maybeSingle();
    if (!res.error) {
      if (!res.data) return { ok: false, error: "not_found" };
      return { ok: true, row: res.data as unknown as Record<string, unknown>, ...tierFlags(select) };
    }
    lastError = res.error.message || lastError;
    if (!isMissingColumnError(res.error.message)) {
      return { ok: false, error: lastError };
    }
  }

  return { ok: false, error: lastError };
}

import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import { loadProfilePersonnelMeta } from "@/lib/profile-personnel-meta";
import { loadProfileTestResultsBundle } from "@/lib/profile-test-results-server";
import { serializeTrialProfileStats } from "@/lib/profile-trial-stats";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import type { UnitAssignment } from "@/lib/types";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();

    const profilePrimaryPromise = supabase
      .from("app_users")
      .select("auth_user_id,duty_location,unit_assignment,rota_platoon,rota_section,avatar_url,profile_name_color,position")
      .eq("id", session.id)
      .maybeSingle();

    const [resultsBundle, profilePrimaryQ] = await Promise.all([
      loadProfileTestResultsBundle(supabase, session.id),
      profilePrimaryPromise,
    ]);

    const resultsRows = resultsBundle.rows;
    const resultsError = resultsBundle.error;
    const trialStats = serializeTrialProfileStats(resultsBundle.trialStats);
    const testActivity = resultsBundle.testActivity;

    let profileRow: Record<string, unknown> | null = (profilePrimaryQ.data || null) as Record<string, unknown> | null;
    let profileError: string | null = profilePrimaryQ.error?.message || null;
    let dutyLocation: "base" | "deployment" = "base";
    let unitAssignment: UnitAssignment | null = null;
    let rotaPlatoon: number | null = null;
    let rotaSection: number | null = null;
    let avatarUrl: string | null = null;
    let nameColor = normalizeProfileNameColor(null);
    let position: string | null = null;

    if (profilePrimaryQ.error && isMissingColumnError(profilePrimaryQ.error.message)) {
      const profileLegacyQ = await supabase.from("app_users").select("auth_user_id").eq("id", session.id).maybeSingle();
      profileRow = (profileLegacyQ.data || null) as Record<string, unknown> | null;
      profileError = profileLegacyQ.error?.message || null;
    } else if (profileRow) {
      if (typeof profileRow.duty_location === "string") {
        dutyLocation = profileRow.duty_location.trim().toLowerCase() === "deployment" ? "deployment" : "base";
      }
      unitAssignment = normalizeUnitAssignment(profileRow.unit_assignment);
      rotaPlatoon = profileRow.rota_platoon != null ? Number(profileRow.rota_platoon) : null;
      rotaSection = profileRow.rota_section != null ? Number(profileRow.rota_section) : null;
      if (typeof profileRow.avatar_url === "string" && profileRow.avatar_url.trim()) {
        avatarUrl = profileRow.avatar_url.trim();
      }
      nameColor = normalizeProfileNameColor(profileRow.profile_name_color);
      if (typeof profileRow.position === "string" && profileRow.position.trim()) {
        position = profileRow.position.trim();
      }
    }

    if (resultsError || profileError) {
      return Response.json(
        { ok: false, error: resultsError || profileError || "profile_bootstrap_failed" },
        { status: 500 },
      );
    }

    const authUserId = typeof profileRow?.auth_user_id === "string" ? profileRow.auth_user_id : null;
    const invitesPromise =
      session.role === "admin"
        ? supabase
            .from("registration_invites")
            .select("code,is_active,max_uses,used_count,created_at")
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });
    const personnelViewPromise = resolvePersonnelProfileViewAccess(session, session.id);
    const authEmailPromise = authUserId
      ? supabase.auth.admin.getUserById(authUserId).catch(() => ({ data: { user: null } }))
      : Promise.resolve({ data: { user: null } });
    const [authInfo, invitesQ, personnelView] = await Promise.all([
      authEmailPromise,
      invitesPromise,
      personnelViewPromise,
    ]);
    const personnelProfileShow = personnelView.show;
    const personnelMeta =
      personnelProfileShow && unitAssignment === "company_4"
        ? await loadProfilePersonnelMeta(session.id)
        : { licenseCategories: [] as string[], bloodGroup: null };

    const email = authInfo.data.user?.email || "";
    let inviteCodes: Array<Record<string, unknown>> = [];
    if (session.role === "admin" && !invitesQ.error) {
      inviteCodes = invitesQ.data || [];
    }

    return Response.json({
      ok: true,
      email,
      dutyLocation,
      unitAssignment,
      rotaPlatoon,
      rotaSection,
      avatarUrl,
      nameColor,
      position,
      licenseCategories: personnelMeta.licenseCategories,
      bloodGroup: personnelMeta.bloodGroup,
      results: resultsRows,
      trialStats,
      testActivity,
      inviteCodes,
      personnelProfileShow,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_bootstrap_exception" },
      { status: 500 },
    );
  }
}

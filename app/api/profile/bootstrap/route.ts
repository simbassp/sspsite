import { resolvePersonnelProfileViewAccess } from "@/lib/personnel-profile-access";
import { syncUserAchievementsByUserId } from "@/lib/achievements-server";
import { loadProfilePersonnelMeta } from "@/lib/profile-personnel-meta";
import { loadPersonnelProfile } from "@/lib/personnel-server";
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
    void syncUserAchievementsByUserId(session.id).catch(() => undefined);

    const resultsPrimaryPromise = supabase
      .from("test_results")
      .select("id,user_id,type,status,score,created_at,started_at,finished_at,duration_seconds,is_completed,questions_total,questions_correct")
      .eq("user_id", session.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const profilePrimaryPromise = supabase
      .from("app_users")
      .select("auth_user_id,duty_location,unit_assignment,rota_platoon,rota_section,rota_module,employment_date,avatar_url,profile_name_color,position")
      .eq("id", session.id)
      .maybeSingle();

    const [resultsPrimaryQ, profilePrimaryQ] = await Promise.all([resultsPrimaryPromise, profilePrimaryPromise]);

    let resultsRows: Array<Record<string, unknown>> = (resultsPrimaryQ.data || []) as Array<Record<string, unknown>>;
    let resultsError: string | null = resultsPrimaryQ.error?.message || null;
    if (resultsPrimaryQ.error && isMissingColumnError(resultsPrimaryQ.error.message)) {
      const resultsLegacyQ = await supabase
        .from("test_results")
        .select("id,user_id,test_type,status,score,created_at,questions_total,questions_correct")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20);
      resultsRows = (resultsLegacyQ.data || []) as Array<Record<string, unknown>>;
      resultsError = resultsLegacyQ.error?.message || null;
    }

    let profileRow: Record<string, unknown> | null = (profilePrimaryQ.data || null) as Record<string, unknown> | null;
    let profileError: string | null = profilePrimaryQ.error?.message || null;
    let dutyLocation: "base" | "deployment" = "base";
    let unitAssignment: UnitAssignment | null = null;
    let rotaPlatoon: number | null = null;
    let rotaSection: number | null = null;
    let rotaModule: number | null = null;
    let employmentDate: string | null = null;
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
      rotaModule = profileRow.rota_module != null ? Number(profileRow.rota_module) : null;
      employmentDate = profileRow.employment_date ? String(profileRow.employment_date).slice(0, 10) : null;
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
    const personnelProfileBundlePromise = personnelViewPromise.then(async (personnelView) => {
      if (!personnelView.show) return null;
      const profile = await loadPersonnelProfile(session.id);
      if (!profile) return null;
      return {
        profile,
        isPreview: personnelView.isPreview,
        canEditOwn: personnelView.canEditOwn,
        canModerate: personnelView.canModerate,
      };
    });
    const authEmailPromise = authUserId
      ? supabase.auth.admin.getUserById(authUserId).catch(() => ({ data: { user: null } }))
      : Promise.resolve({ data: { user: null } });
    const personnelMetaPromise =
      unitAssignment === "company_4"
        ? loadProfilePersonnelMeta(session.id)
        : Promise.resolve({ licenseCategories: [] as string[], bloodGroup: null });

    const [authInfo, invitesQ, personnelMeta, personnelProfile] = await Promise.all([
      authEmailPromise,
      invitesPromise,
      personnelMetaPromise,
      personnelProfileBundlePromise,
    ]);

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
      rotaModule,
      employmentDate,
      avatarUrl,
      nameColor,
      position,
      licenseCategories: personnelMeta.licenseCategories,
      bloodGroup: personnelMeta.bloodGroup,
      results: resultsRows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        type: r.type ?? r.test_type,
        status: r.status,
        score: r.score,
        created_at: r.created_at,
        started_at: r.started_at ?? null,
        finished_at: r.finished_at ?? null,
        duration_seconds: r.duration_seconds ?? null,
        is_completed: r.is_completed ?? null,
        questions_total: r.questions_total ?? null,
        questions_correct: r.questions_correct ?? null,
      })),
      inviteCodes,
      personnelProfile,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_bootstrap_exception" },
      { status: 500 },
    );
  }
}

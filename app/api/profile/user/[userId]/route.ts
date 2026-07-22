import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { loadUserUnlockedAchievementIds } from "@/lib/achievements-server";
import { loadProfilePersonnelMeta } from "@/lib/profile-personnel-meta";
import { loadInspectUserRow } from "@/lib/profile-inspect-user-server";
import { loadProfileTestResultsBundle } from "@/lib/profile-test-results-server";
import { serializeTrialProfileStats } from "@/lib/profile-trial-stats";
import { normalizeAvatarStoragePath } from "@/lib/avatar-display";
import { loadIdentityCosmeticsForUser } from "@/lib/user-identity-cosmetics-server";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import { canInspectOtherUserProfile, canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= ONLINE_LAST_SEEN_MAX_MS;
}

function looksLikeUuid(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || !canInspectOtherUserProfile(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  if (userId === session.id) {
    return Response.json({ ok: false, error: "use_own_profile" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();

    const [userLoad, resultsBundle] = await Promise.all([
      loadInspectUserRow(supabase, userId),
      loadProfileTestResultsBundle(supabase, userId),
    ]);
    if (!userLoad.ok) {
      const status = userLoad.error === "not_found" ? 404 : 500;
      return Response.json({ ok: false, error: userLoad.error }, { status });
    }
    if (resultsBundle.error) {
      return Response.json({ ok: false, error: resultsBundle.error }, { status: 500 });
    }

    const userRow = userLoad.row;
    const dutyFromDb = userLoad.dutyFromDb;
    const unitFromDb = userLoad.unitFromDb;
    const onlineFromFlagOnly = userLoad.onlineFromFlagOnly;

    const resultsRows = resultsBundle.rows;
    const trialStats = serializeTrialProfileStats(resultsBundle.trialStats);

    const isOnline = onlineFromFlagOnly
      ? userRow.is_online === true
      : effectiveOnlineStrict(userRow.is_online, userRow.last_seen_at);

    const dutyLocation =
      dutyFromDb &&
      typeof userRow.duty_location === "string" &&
      userRow.duty_location.trim().toLowerCase() === "deployment"
        ? "deployment"
        : "base";

    const unitAssignment = unitFromDb ? normalizeUnitAssignment(userRow.unit_assignment) : null;
    const rotaPlatoon = userRow.rota_platoon != null ? Number(userRow.rota_platoon) : null;
    const rotaSection = userRow.rota_section != null ? Number(userRow.rota_section) : null;
    const rotaModule = userRow.rota_module != null ? Number(userRow.rota_module) : null;
    const employmentDate = userRow.employment_date ? String(userRow.employment_date).slice(0, 10) : null;
    const personnelMeta =
      unitAssignment === "company_4"
        ? await loadProfilePersonnelMeta(userId)
        : { licenseCategories: [], bloodGroup: null };

    const [cosmetics, unlockedAchievementIds] = await Promise.all([
      loadIdentityCosmeticsForUser(userId),
      loadUserUnlockedAchievementIds(userId),
    ]);
    const avatarUrl = normalizeAvatarStoragePath(
      typeof userRow.avatar_url === "string" ? userRow.avatar_url : null,
    );

    return Response.json({
      ok: true,
      user: {
        id: String(userRow.id),
        name: typeof userRow.name === "string" ? userRow.name : "",
        callsign: typeof userRow.callsign === "string" ? userRow.callsign : "",
        position: typeof userRow.position === "string" ? userRow.position : "",
        login: typeof userRow.login === "string" ? userRow.login : "",
        role: userRow.role === "admin" ? "admin" : "employee",
        status: userRow.status === "inactive" ? "inactive" : "active",
        is_online: isOnline,
        duty_location: dutyLocation,
        unit_assignment: unitAssignment,
        rota_platoon: rotaPlatoon,
        rota_section: rotaSection,
        rota_module: rotaModule,
        employment_date: employmentDate,
        avatarUrl,
        nameColor: cosmetics.adminNameColor ?? null,
        cosmetics,
        unlockedAchievementIds,
        licenseCategories: personnelMeta.licenseCategories,
        bloodGroup: personnelMeta.bloodGroup,
      },
      results: resultsRows,
      trialStats,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_user_exception" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!userId || !looksLikeUuid(userId)) {
    return Response.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  let body: { name?: string; callsign?: string };
  try {
    body = (await request.json()) as { name?: string; callsign?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const callsign = String(body.callsign ?? "").trim();
  if (!name || !callsign) {
    return Response.json({ ok: false, error: "missing_name_or_callsign" }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseServiceClient();
    const upd = await supabase.from("app_users").update({ name, callsign }).eq("id", userId);
    if (upd.error) {
      return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
    }
    return Response.json({ ok: true, name, callsign });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_user_patch_exception" },
      { status: 500 },
    );
  }
}

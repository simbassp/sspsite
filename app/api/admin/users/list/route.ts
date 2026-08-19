import { ONLINE_LAST_SEEN_MAX_MS } from "@/lib/presence-constants";
import { IDENTITY_COSMETIC_USER_COLUMNS, mapIdentityCosmeticsFromRow } from "@/lib/user-identity-cosmetics";
import { normalizeUnitAssignment } from "@/lib/unit-assignment";
import { normalizeAvatarStoragePath } from "@/lib/avatar-display";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { canManageUsers, canViewUserList } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

const USER_LIST_COLUMNS =
  "id,auth_user_id,login,name,callsign,position,avatar_url,profile_name_color,profile_cosmetic_name_color,profile_cosmetic_avatar_frame,profile_cosmetic_bank_overlay,can_manage_content,can_manage_news,can_manage_tests,can_manage_results,can_manage_uav,can_manage_counteraction,can_manage_tactical_medicine,can_manage_users,can_view_user_list,can_reset_test_results,can_view_online,can_moderate_personnel,is_online,last_seen_at,role,status,duty_location,unit_assignment";

function effectiveOnlineStrict(isOnline: unknown, lastSeenAt: unknown): boolean {
  if (isOnline !== true) return false;
  if (lastSeenAt == null || typeof lastSeenAt !== "string") return false;
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= ONLINE_LAST_SEEN_MAX_MS;
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function escapeIlike(value: string) {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

function parseUsersListQuery(searchParams: URLSearchParams) {
  return {
    page: Math.max(1, Number(searchParams.get("page") || 1) || 1),
    pageSize: Math.min(50, Math.max(1, Number(searchParams.get("pageSize") || 10) || 10)),
    search: (searchParams.get("search") || "").trim(),
    position: searchParams.get("position") || "all",
    duty: searchParams.get("duty") || "all",
    unit: searchParams.get("unit") || "all",
  };
}

function normalizeUserRow(
  r: Record<string, unknown>,
  options: { onlineFromFlagOnly: boolean; dutyFromDb: boolean; unitFromDb: boolean },
) {
  return {
    id: r.id,
    auth_user_id: r.auth_user_id ?? null,
    login: typeof r.login === "string" ? r.login : "",
    name: r.name,
    callsign: r.callsign,
    position: r.position,
    avatar_url: normalizeAvatarStoragePath(typeof r.avatar_url === "string" ? r.avatar_url : null),
    profile_name_color: typeof r.profile_name_color === "string" ? r.profile_name_color : null,
    cosmetics: mapIdentityCosmeticsFromRow(r),
    can_manage_content: r.can_manage_content ?? false,
    can_manage_news: r.can_manage_news ?? undefined,
    can_manage_tests: r.can_manage_tests ?? undefined,
    can_manage_results: r.can_manage_results ?? undefined,
    can_manage_uav: r.can_manage_uav ?? undefined,
    can_manage_counteraction: r.can_manage_counteraction ?? undefined,
    can_manage_tactical_medicine: r.can_manage_tactical_medicine ?? undefined,
    can_manage_users: r.can_manage_users ?? false,
    can_view_user_list: r.can_view_user_list ?? false,
    can_reset_test_results: r.can_reset_test_results ?? undefined,
    can_view_online: r.can_view_online ?? false,
    can_moderate_personnel: r.can_moderate_personnel ?? false,
    is_online: options.onlineFromFlagOnly
      ? r.is_online === true
      : effectiveOnlineStrict(r.is_online, r.last_seen_at),
    duty_location:
      options.dutyFromDb && typeof r.duty_location === "string" && r.duty_location.trim().toLowerCase() === "deployment"
        ? "deployment"
        : "base",
    unit_assignment: options.unitFromDb ? normalizeUnitAssignment(r.unit_assignment) : null,
    role: r.role === "admin" ? "admin" : "employee",
    status: r.status === "inactive" ? "inactive" : "active",
  };
}

type UsersListQuery = ReturnType<typeof parseUsersListQuery>;

function applyUserListFilters<T extends { eq: (col: string, val: string) => T; or: (expr: string) => T; is: (col: string, val: null) => T }>(
  query: T,
  filters: UsersListQuery,
) {
  let next = query;
  if (filters.position !== "all") next = next.eq("position", filters.position);
  if (filters.duty === "base") next = next.eq("duty_location", "base");
  if (filters.duty === "deployment") next = next.eq("duty_location", "deployment");
  if (filters.unit === "unset") next = next.is("unit_assignment", null);
  else if (filters.unit !== "all") next = next.eq("unit_assignment", filters.unit);
  if (filters.search) {
    const q = escapeIlike(filters.search);
    next = next.or(`name.ilike.%${q}%,callsign.ilike.%${q}%,login.ilike.%${q}%,position.ilike.%${q}%`);
  }
  return next;
}

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session || (!canManageUsers(session) && !canViewUserList(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const query = parseUsersListQuery(new URL(req.url).searchParams);
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  try {
    const supabase = getServerSupabaseServiceClient();
    let onlineFromFlagOnly = false;
    let dutyFromDb = true;
    let unitFromDb = true;

    const runPaged = (select: string) => {
      let q = supabase.from("app_users").select(select, { count: "exact" }).order("created_at", { ascending: false });
      q = applyUserListFilters(q, query);
      return q.range(from, to);
    };

    let response = await runPaged(USER_LIST_COLUMNS);
    if (response.error && isMissingColumnError(response.error.message)) {
      let q = supabase.from("app_users").select("*", { count: "exact" }).order("created_at", { ascending: false });
      q = applyUserListFilters(q, query);
      response = await q.range(from, to);
      const sample = (response.data?.[0] ?? {}) as Record<string, unknown>;
      dutyFromDb = Object.prototype.hasOwnProperty.call(sample, "duty_location");
      unitFromDb = Object.prototype.hasOwnProperty.call(sample, "unit_assignment");
      onlineFromFlagOnly = !Object.prototype.hasOwnProperty.call(sample, "last_seen_at");
    }

    if (response.error) return Response.json({ ok: false, error: response.error.message }, { status: 500 });

    const rawRows = (Array.isArray(response.data) ? response.data : []) as unknown[];
    const rows = rawRows.map((row) =>
      normalizeUserRow(row as Record<string, unknown>, { onlineFromFlagOnly, dutyFromDb, unitFromDb }),
    );

    return Response.json({
      ok: true,
      rows,
      total: response.count ?? rows.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_users_list_exception" },
      { status: 500 },
    );
  }
}

import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type PermissionsPayload = {
  news: boolean;
  tests: boolean;
  results: boolean;
  resetResults: boolean;
  uav: boolean;
  counteraction: boolean;
  userList: boolean;
  users: boolean;
  online: boolean;
};

type PatchBody = {
  name?: string;
  callsign?: string;
  position?: string;
  status?: "active" | "inactive";
  canManageContent?: boolean;
  permissions?: PermissionsPayload;
  role?: "employee" | "admin";
};

function restErrorMissingColumn(message: string | undefined, column: string) {
  const m = (message ?? "").toLowerCase();
  const col = column.toLowerCase();
  if (!col || !m.includes(col)) return false;
  return m.includes("column") && m.includes("does not exist");
}

function getAdminGrant() {
  return {
    can_manage_content: true,
    can_manage_news: true,
    can_manage_tests: true,
    can_manage_results: true,
    can_manage_uav: true,
    can_manage_counteraction: true,
    can_manage_users: true,
    can_view_user_list: true,
    can_view_online: true,
    can_reset_test_results: true,
  } as const;
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { userId } = await context.params;
  const body = (await request.json()) as PatchBody;
  const supabase = getServerSupabaseServiceClient();

  const nextPermissions = body.permissions;
  const nextCanManageContent =
    nextPermissions !== undefined
      ? nextPermissions.news || nextPermissions.tests || nextPermissions.uav || nextPermissions.counteraction
      : body.canManageContent;

  const roleFragment =
    body.role !== undefined
      ? {
          role: body.role,
          ...(body.role === "admin" ? getAdminGrant() : {}),
        }
      : {};

  const payload = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.callsign !== undefined ? { callsign: body.callsign } : {}),
    ...(body.position !== undefined ? { position: body.position } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(nextCanManageContent !== undefined ? { can_manage_content: nextCanManageContent } : {}),
    ...(nextPermissions !== undefined ? { can_manage_news: nextPermissions.news } : {}),
    ...(nextPermissions !== undefined ? { can_manage_tests: nextPermissions.tests } : {}),
    ...(nextPermissions !== undefined ? { can_manage_results: nextPermissions.results } : {}),
    ...(nextPermissions !== undefined ? { can_manage_uav: nextPermissions.uav } : {}),
    ...(nextPermissions !== undefined ? { can_manage_counteraction: nextPermissions.counteraction } : {}),
    ...(nextPermissions !== undefined ? { can_manage_users: nextPermissions.users } : {}),
    ...(nextPermissions !== undefined ? { can_view_user_list: nextPermissions.userList } : {}),
    ...(nextPermissions !== undefined ? { can_view_online: nextPermissions.online } : {}),
    ...(nextPermissions !== undefined ? { can_reset_test_results: nextPermissions.resetResults } : {}),
    ...roleFragment,
  };

  const attempt = await supabase.from("app_users").update(payload).eq("id", userId);
  if (!attempt.error) return Response.json({ ok: true });

  if (nextPermissions !== undefined && restErrorMissingColumn(attempt.error.message, "can_view_user_list")) {
    const fallback = { ...payload } as Record<string, unknown>;
    delete fallback.can_view_user_list;
    const noUserList = await supabase.from("app_users").update(fallback).eq("id", userId);
    if (!noUserList.error) return Response.json({ ok: true, warning: "no_user_list_column" });
  }

  const legacyPayload = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.callsign !== undefined ? { callsign: body.callsign } : {}),
    ...(body.position !== undefined ? { position: body.position } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(nextCanManageContent !== undefined ? { can_manage_content: nextCanManageContent } : {}),
    ...(body.role !== undefined ? { role: body.role } : {}),
  };
  const legacy = await supabase.from("app_users").update(legacyPayload).eq("id", userId);
  if (!legacy.error) return Response.json({ ok: true, warning: "legacy_permissions_fallback" });
  return Response.json({ ok: false, error: legacy.error.message || attempt.error.message }, { status: 400 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession();
  if (!session || !canManageUsers(session)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { userId } = await context.params;
  const supabase = getServerSupabaseServiceClient();

  const target = await supabase.from("app_users").select("id,name,callsign,role").eq("id", userId).maybeSingle();
  if (target.error) return Response.json({ ok: false, error: target.error.message }, { status: 400 });
  if (!target.data) return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  if (target.data.role === "admin") {
    return Response.json({ ok: false, error: "Удаление учётной записи администратора запрещено." }, { status: 400 });
  }

  let warning: string | null = null;
  const rpc = await supabase.rpc("admin_delete_user", { p_user_id: userId });
  if (rpc.error || rpc.data !== true) {
    const fallbackDelete = await supabase.from("app_users").delete().eq("id", userId);
    if (fallbackDelete.error) {
      return Response.json({ ok: false, error: fallbackDelete.error.message || rpc.error?.message || "delete_failed" }, { status: 400 });
    }
    warning = rpc.error?.message || "rpc_fallback_delete";
  }

  await supabase.from("dashboard_events").insert({
    kind: "user_deleted",
    payload: {
      user_id: target.data.id,
      name: target.data.name,
      callsign: target.data.callsign,
    },
  });

  return Response.json({ ok: true, warning });
}

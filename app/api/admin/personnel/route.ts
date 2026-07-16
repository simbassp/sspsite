import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { canModeratePersonnel } from "@/lib/permissions";
import {
  loadPendingRequests,
  loadPersonnelModuleSettings,
  savePersonnelModuleSettings,
} from "@/lib/personnel-server";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && !canModeratePersonnel(session))) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const settings = await loadPersonnelModuleSettings();
  const pending = await loadPendingRequests();
  return Response.json({ ok: true, settings, pending });
}

export async function PATCH(req: Request) {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    moduleEnabled?: boolean;
    moderationEnabled?: boolean;
  };
  await savePersonnelModuleSettings(body);
  const settings = await loadPersonnelModuleSettings();
  return Response.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    userId?: string;
    rotaPlatoon?: number | null;
    rotaSection?: number | null;
  };
  if (!body.userId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  const supabase = getServerSupabaseServiceClient();
  const upd = await supabase
    .from("app_users")
    .update({
      rota_platoon: body.rotaPlatoon ?? null,
      rota_section: body.rotaSection ?? null,
    })
    .eq("id", body.userId)
    .select("id")
    .maybeSingle();

  if (upd.error) {
    return Response.json({ ok: false, error: upd.error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

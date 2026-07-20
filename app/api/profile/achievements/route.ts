import { ALL_ACHIEVEMENTS, computeUnlockedAchievementIds } from "@/lib/achievements-catalog";
import {
  loadUserAchievementProgress,
  loadUserAchievementsState,
  markAchievementNotificationsRead,
  updateUserAchievementCosmetics,
} from "@/lib/achievements-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

async function readEmploymentDate(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const userQ = await supabase.from("app_users").select("employment_date").eq("id", userId).maybeSingle();
  return userQ.data?.employment_date ? String(userQ.data.employment_date).slice(0, 10) : null;
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ ok: false, error: "admin_preview_only" }, { status: 403 });
  }

  const employmentDate = await readEmploymentDate(session.id);
  const state = await loadUserAchievementsState(session.id, employmentDate, { adminPreviewAll: true });
  return Response.json({ ok: true, ...state });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return Response.json({ ok: false, error: "admin_preview_only" }, { status: 403 });
  }

  let body: { avatarFrame?: string | null; nameColor?: string | null; dismissNotificationIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const employmentDate = await readEmploymentDate(session.id);
  const progress = await loadUserAchievementProgress(session.id, employmentDate);
  const unlockedIds = ALL_ACHIEVEMENTS.map((item) => item.id).concat(computeUnlockedAchievementIds(progress));
  const uniqueUnlocked = [...new Set(unlockedIds)];

  const result = await updateUserAchievementCosmetics(session.id, uniqueUnlocked, {
    avatarFrame: body.avatarFrame,
    nameColor: body.nameColor,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });

  if (Array.isArray(body.dismissNotificationIds) && body.dismissNotificationIds.length) {
    await markAchievementNotificationsRead(session.id, body.dismissNotificationIds);
  }

  const state = await loadUserAchievementsState(session.id, employmentDate, { adminPreviewAll: true });
  return Response.json({ ok: true, ...state });
}

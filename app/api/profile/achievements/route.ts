import {
  loadUserAchievementsState,
  markAchievementNotificationsRead,
  resolveUserUnlockedAchievementIds,
  syncUserAchievements,
  updateUserAchievementCosmetics,
} from "@/lib/achievements-server";
import { loadAchievementNotifications } from "@/lib/user-identity-cosmetics-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

async function readEmploymentDate(userId: string) {
  const supabase = getServerSupabaseServiceClient();
  const userQ = await supabase.from("app_users").select("employment_date").eq("id", userId).maybeSingle();
  return userQ.data?.employment_date ? String(userQ.data.employment_date).slice(0, 10) : null;
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  if (url.searchParams.get("notificationsOnly") === "1") {
    const pendingNotifications = await loadAchievementNotifications(session.id);
    return Response.json({ ok: true, pendingNotifications });
  }

  const employmentDate = await readEmploymentDate(session.id);
  const sync = url.searchParams.get("sync") === "1";
  const state = await loadUserAchievementsState(session.id, employmentDate, { sync });
  return Response.json({ ok: true, ...state });
}

export async function PATCH(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: {
    avatarFrame?: string | null;
    bankOverlay?: string | null;
    nameColor?: string | null;
    dismissNotificationIds?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const employmentDate = await readEmploymentDate(session.id);
  await syncUserAchievements(session.id, employmentDate);
  const unlockedIds = await resolveUserUnlockedAchievementIds(session.id, employmentDate);

  const result = await updateUserAchievementCosmetics(session.id, unlockedIds, {
    avatarFrame: body.avatarFrame,
    bankOverlay: body.bankOverlay,
    nameColor: body.nameColor,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });

  if (Array.isArray(body.dismissNotificationIds) && body.dismissNotificationIds.length) {
    await markAchievementNotificationsRead(session.id, body.dismissNotificationIds);
  }

  const state = await loadUserAchievementsState(session.id, employmentDate, { sync: true });
  return Response.json({ ok: true, ...state });
}

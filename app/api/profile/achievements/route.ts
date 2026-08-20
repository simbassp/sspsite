import {
  loadUserAchievementsState,
  markAchievementNotificationsRead,
  resolveUserUnlockedAchievementIds,
  syncUserAchievements,
  updateUserAchievementCosmetics,
} from "@/lib/achievements-server";
import { loadAchievementNotifications } from "@/lib/user-identity-cosmetics-server";
import { getServerSession } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  if (url.searchParams.get("notificationsOnly") === "1") {
    const pendingNotifications = await loadAchievementNotifications(session.id);
    return Response.json({ ok: true, pendingNotifications });
  }

  const sync = url.searchParams.get("sync") === "1";
  const includeTopRank = url.searchParams.get("includeTopRank") === "1";
  const state = await loadUserAchievementsState(session.id, null, { sync, includeTopRank });
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

  await syncUserAchievements(session.id, null);
  const unlockedIds = await resolveUserUnlockedAchievementIds(session.id, null);

  const result = await updateUserAchievementCosmetics(session.id, unlockedIds, {
    avatarFrame: body.avatarFrame,
    bankOverlay: body.bankOverlay,
    nameColor: body.nameColor,
  });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 400 });

  if (Array.isArray(body.dismissNotificationIds) && body.dismissNotificationIds.length) {
    await markAchievementNotificationsRead(session.id, body.dismissNotificationIds);
  }

  const state = await loadUserAchievementsState(session.id, null, { sync: true, includeTopRank: true });
  return Response.json({ ok: true, ...state });
}

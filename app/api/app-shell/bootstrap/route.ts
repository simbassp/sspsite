import { loadAchievementNotifications, fetchUserCosmeticRow } from "@/lib/user-identity-cosmetics-server";
import { mapIdentityCosmeticsFromRow } from "@/lib/user-identity-cosmetics";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { resolvePersonnelAccess } from "@/lib/personnel-access";
import { loadPersonnelModuleSettings } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

const SHELL_SUPABASE_TIMEOUT_MS = 10_000;

/** Один запрос вместо трёх на каждой странице: косметика профиля, достижения, пункт «Сотрудники». */
export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: SHELL_SUPABASE_TIMEOUT_MS });
    const [cosmeticRow, pendingNotifications, settings] = await Promise.all([
      fetchUserCosmeticRow(supabase, session.id),
      loadAchievementNotifications(session.id),
      loadPersonnelModuleSettings(),
    ]);

    const cosmetics = mapIdentityCosmeticsFromRow(cosmeticRow);
    const access = resolvePersonnelAccess({
      session,
      unitAssignment: session.unitAssignment ?? null,
      settings,
    });

    return Response.json({
      ok: true,
      nameColor: cosmetics.adminNameColor ?? normalizeProfileNameColor(null),
      cosmetics: {
        adminNameColor: cosmetics.adminNameColor ?? null,
        achievementNameColor: cosmetics.achievementNameColor ?? null,
        avatarFrame: cosmetics.avatarFrame ?? null,
        bankOverlay: cosmetics.bankOverlay ?? null,
      },
      showPersonnel: access.canView,
      pendingNotifications: pendingNotifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
      })),
    });
  } catch (error) {
    return Response.json({
      ok: true,
      nameColor: session.nameColor ?? normalizeProfileNameColor(null),
      cosmetics: {
        adminNameColor: session.nameColor ?? null,
        achievementNameColor: session.cosmetics?.achievementNameColor ?? null,
        avatarFrame: session.cosmetics?.avatarFrame ?? null,
        bankOverlay: session.cosmetics?.bankOverlay ?? null,
      },
      showPersonnel: false,
      pendingNotifications: [],
      degraded: true,
      error: error instanceof Error ? error.message : "app_shell_bootstrap_exception",
    });
  }
}

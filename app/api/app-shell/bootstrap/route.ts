import { loadAchievementNotifications, fetchUserCosmeticRow } from "@/lib/user-identity-cosmetics-server";
import { mapIdentityCosmeticsFromRow } from "@/lib/user-identity-cosmetics";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { resolvePersonnelAccess } from "@/lib/personnel-access";
import { loadPersonnelModuleSettings } from "@/lib/personnel-server";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

const SHELL_SUPABASE_TIMEOUT_MS = 10_000;
const SHELL_BOOTSTRAP_CACHE_MS = 45_000;

type ShellBootstrapBody = {
  ok: true;
  nameColor: ReturnType<typeof normalizeProfileNameColor>;
  cosmetics: {
    adminNameColor: string | null;
    achievementNameColor: string | null;
    avatarFrame: string | null;
    bankOverlay: string | null;
  };
  showPersonnel: boolean;
  pendingNotifications: Array<{ id: string; title: string; body: string }>;
  degraded?: boolean;
  error?: string;
};

const shellBootstrapCache = new Map<string, { expiresAt: number; body: ShellBootstrapBody }>();

async function buildShellBootstrap(session: NonNullable<Awaited<ReturnType<typeof getServerSession>>>): Promise<ShellBootstrapBody> {
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

  return {
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
  };
}

/** Один запрос вместо трёх на каждой странице: косметика профиля, достижения, пункт «Сотрудники». */
export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const cached = shellBootstrapCache.get(session.id);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.body);
  }

  try {
    const body = await buildShellBootstrap(session);
    shellBootstrapCache.set(session.id, { body, expiresAt: Date.now() + SHELL_BOOTSTRAP_CACHE_MS });
    return Response.json(body);
  } catch (error) {
    const body: ShellBootstrapBody = {
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
    };
    return Response.json(body);
  }
}

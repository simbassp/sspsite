import { fetchUserCosmeticRow } from "@/lib/user-identity-cosmetics-server";
import { mapIdentityCosmeticsFromRow } from "@/lib/user-identity-cosmetics";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient({ fetchTimeoutMs: 10_000 });
    const row = await fetchUserCosmeticRow(supabase, session.id);
    const cosmetics = mapIdentityCosmeticsFromRow(row);
    return Response.json({
      ok: true,
      nameColor: cosmetics.adminNameColor ?? normalizeProfileNameColor(null),
      cosmetics: {
        adminNameColor: cosmetics.adminNameColor ?? null,
        achievementNameColor: cosmetics.achievementNameColor ?? null,
        avatarFrame: cosmetics.avatarFrame ?? null,
        bankOverlay: cosmetics.bankOverlay ?? null,
      },
    });
  } catch {
    return Response.json({
      ok: true,
      nameColor: session.nameColor ?? normalizeProfileNameColor(null),
      cosmetics: {
        adminNameColor: session.nameColor ?? null,
        achievementNameColor: session.cosmetics?.achievementNameColor ?? null,
        avatarFrame: session.cosmetics?.avatarFrame ?? null,
        bankOverlay: session.cosmetics?.bankOverlay ?? null,
      },
      degraded: true,
    });
  }
}

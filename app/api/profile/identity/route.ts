import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { ACHIEVEMENT_COSMETIC_USER_COLUMNS, mapIdentityCosmeticsFromRow } from "@/lib/user-identity-cosmetics";

export const runtime = "nodejs";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const supabase = getServerSupabaseServiceClient();
    const primary = await supabase
      .from("app_users")
      .select("profile_name_color,profile_cosmetic_name_color,profile_cosmetic_avatar_frame,profile_cosmetic_bank_overlay")
      .eq("id", session.id)
      .maybeSingle();

    let row = primary.data as Record<string, unknown> | null;
    if (primary.error && isMissingColumnError(primary.error.message)) {
      const fallback = await supabase
        .from("app_users")
        .select(`profile_name_color,${ACHIEVEMENT_COSMETIC_USER_COLUMNS}`)
        .eq("id", session.id)
        .maybeSingle();
      row = fallback.data as Record<string, unknown> | null;
    } else if (primary.error) {
      return Response.json({ ok: false, error: primary.error.message }, { status: 500 });
    }

    const cosmetics = mapIdentityCosmeticsFromRow(row ?? {});
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
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "profile_identity_exception" },
      { status: 500 },
    );
  }
}

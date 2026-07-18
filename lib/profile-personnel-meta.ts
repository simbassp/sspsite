import {
  normalizePersonnelLicenseCategories,
  normalizePersonnelBloodGroup,
  type PersonnelBloodGroup,
  type PersonnelLicenseCategory,
} from "@/lib/personnel-catalog";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export type ProfilePersonnelMeta = {
  licenseCategories: PersonnelLicenseCategory[];
  bloodGroup: PersonnelBloodGroup | null;
};

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export async function loadProfilePersonnelMeta(userId: string): Promise<ProfilePersonnelMeta> {
  const supabase = getServerSupabaseServiceClient();
  const [licenseRes, userRes] = await Promise.all([
    supabase.from("personnel_licenses").select("categories").eq("user_id", userId).maybeSingle(),
    supabase.from("app_users").select("blood_group").eq("id", userId).maybeSingle(),
  ]);

  let bloodGroup: PersonnelBloodGroup | null = null;
  if (!userRes.error) {
    bloodGroup = normalizePersonnelBloodGroup((userRes.data as { blood_group?: unknown } | null)?.blood_group);
  }

  return {
    licenseCategories: normalizePersonnelLicenseCategories(
      (licenseRes.data as { categories?: unknown } | null)?.categories,
    ),
    bloodGroup,
  };
}

export async function saveProfileLicenseCategories(userId: string, categories: unknown) {
  const normalized = normalizePersonnelLicenseCategories(categories);
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase.from("personnel_licenses").upsert(
    {
      user_id: userId,
      categories: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (res.error) return { ok: false as const, error: res.error.message };
  return { ok: true as const, licenseCategories: normalized };
}

export async function saveProfileBloodGroup(userId: string, bloodGroup: unknown) {
  const normalized = normalizePersonnelBloodGroup(bloodGroup);
  const supabase = getServerSupabaseServiceClient();
  const res = await supabase
    .from("app_users")
    .update({ blood_group: normalized })
    .eq("id", userId)
    .select("blood_group")
    .maybeSingle();

  if (res.error) {
    if (isMissingColumnError(res.error.message)) {
      return {
        ok: false as const,
        error: "Колонка blood_group отсутствует. Примените миграции Supabase.",
      };
    }
    return { ok: false as const, error: res.error.message };
  }

  const saved = normalizePersonnelBloodGroup(res.data?.blood_group);
  return { ok: true as const, bloodGroup: saved };
}

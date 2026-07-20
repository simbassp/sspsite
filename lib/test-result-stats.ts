import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

export function resolveTestResultType(row: { type?: unknown; test_type?: unknown }): "trial" | "final" {
  const raw = row.type ?? row.test_type;
  return raw === "final" ? "final" : "trial";
}

/** Считает сданные попытки по фактическим строкам test_results (как в истории профиля). */
export async function countPassedTestsForUser(
  supabase: SupabaseClient,
  userId: string,
  type: "trial" | "final",
): Promise<number> {
  const selectors = ["type,status", "type,test_type,status", "test_type,status"] as const;

  for (const select of selectors) {
    const { data, error } = await supabase
      .from("test_results")
      .select(select)
      .eq("user_id", userId)
      .eq("status", "passed");
    if (error) {
      if (isMissingColumnError(error.message)) continue;
      return 0;
    }
    let count = 0;
    for (const row of data ?? []) {
      if (resolveTestResultType(row as { type?: unknown; test_type?: unknown }) === type) count += 1;
    }
    return count;
  }
  return 0;
}

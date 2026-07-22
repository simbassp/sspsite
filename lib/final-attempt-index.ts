import { effectiveFinalCountingFromUtc } from "@/lib/final-effective-counting";

type FinalAttemptRow = {
  id: string;
  user_id: string;
  created_at: string;
};

/** Номер итоговой попытки в текущем окне (1..N), как в /api/tests/history. */
export function buildFinalAttemptIndexLookup(
  finalRows: FinalAttemptRow[],
  countingFromByUserId: Map<string, string | null | undefined>,
): Map<string, number> {
  const byUser = new Map<string, Array<{ id: string; created_at: string }>>();

  for (const row of finalRows) {
    const userId = String(row.user_id);
    const createdAt = String(row.created_at ?? "");
    if (!userId || !createdAt) continue;

    const from = effectiveFinalCountingFromUtc(countingFromByUserId.get(userId) ?? null);
    if (new Date(createdAt).getTime() < new Date(from).getTime()) continue;

    const list = byUser.get(userId) ?? [];
    list.push({ id: String(row.id), created_at: createdAt });
    byUser.set(userId, list);
  }

  const idxById = new Map<string, number>();
  for (const list of byUser.values()) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    list.forEach((row, index) => idxById.set(row.id, index + 1));
  }

  return idxById;
}

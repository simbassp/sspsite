import { getServerSupabaseServiceClient } from "@/lib/server-supabase";

export const runtime = "nodejs";

type InviteRow = {
  code: string;
  is_active: boolean;
  max_uses: number | null;
  used_count: number;
};

function rowIsUsable(row: InviteRow): boolean {
  return row.is_active === true && (row.max_uses == null || row.used_count < row.max_uses);
}

/**
 * Проверка кода приглашения на сервере (service role), чтобы не зависеть от RPC/anon.
 * Возвращает точный `code` из таблицы для поля invite_code при signUp (для триггера consume).
 */
export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const raw = String(body.code ?? "").trim();
  if (!raw) {
    return Response.json({ ok: true, valid: false });
  }

  let supabase: ReturnType<typeof getServerSupabaseServiceClient>;
  try {
    supabase = getServerSupabaseServiceClient();
  } catch {
    return Response.json({ ok: true, valid: false, serverCheckSkipped: true });
  }

  try {
    const upper = raw.toUpperCase();
    const lower = raw.toLowerCase();

    const trySelect = async (code: string) => {
      const q = await supabase.from("registration_invites").select("code,is_active,max_uses,used_count").eq("code", code).maybeSingle();
      if (q.error || !q.data) return null;
      return q.data as InviteRow;
    };

    let row: InviteRow | null = (await trySelect(upper)) || (await trySelect(raw)) || (await trySelect(lower));

    if (!row) {
      const listQ = await supabase
        .from("registration_invites")
        .select("code,is_active,max_uses,used_count")
        .limit(2000);
      const list = (listQ.data || []) as InviteRow[];
      const needle = raw.toUpperCase();
      row = list.find((r) => String(r.code).trim().toUpperCase() === needle) ?? null;
    }

    if (!row || !rowIsUsable(row)) {
      return Response.json({ ok: true, valid: false });
    }

    return Response.json({ ok: true, valid: true, canonicalCode: row.code });
  } catch {
    return Response.json({ ok: true, valid: false });
  }
}

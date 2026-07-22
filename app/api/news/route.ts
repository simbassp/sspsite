import { normalizeAvatarStoragePath } from "@/lib/avatar-display";
import {
  ACHIEVEMENT_COSMETIC_USER_COLUMNS,
  IDENTITY_COSMETIC_USER_COLUMNS,
  mapIdentityCosmeticsFromRow,
  mergeIdentityCosmetics,
} from "@/lib/user-identity-cosmetics";
import { loadIdentityCosmeticsMap, loadTopRankBadgeMap } from "@/lib/user-identity-cosmetics-server";
import { normalizeProfileNameColor } from "@/lib/profile-name-color";
import { getServerSession } from "@/lib/server-auth";
import { getServerSupabaseServiceClient } from "@/lib/server-supabase";
import { canManageNews } from "@/lib/permissions";
import { isPlaceholderNewsAuthor } from "@/lib/news-author";
import { seedData } from "@/lib/seed";
import { NewsTextStyle, SessionUser } from "@/lib/types";
import {
  buildNewsFormatPayload,
  readNewsKindFromRow,
  readNewsPriorityFromRow,
} from "@/lib/news-format";

export const runtime = "nodejs";

const DEFAULT_NEWS_TEXT_STYLE: NewsTextStyle = {
  fontSize: 16,
  bold: false,
  italic: false,
  underline: false,
};

function normalizeNewsTextStyle(input: unknown): NewsTextStyle {
  if (!input || typeof input !== "object") return DEFAULT_NEWS_TEXT_STYLE;
  const candidate = input as Partial<NewsTextStyle>;
  const fontSizeRaw = Number(candidate.fontSize);
  return {
    fontSize: Number.isFinite(fontSizeRaw) ? Math.min(32, Math.max(12, Math.round(fontSizeRaw))) : 16,
    bold: candidate.bold === true,
    italic: candidate.italic === true,
    underline: candidate.underline === true,
  };
}

function normalizeNewsRows(rows: Array<Record<string, unknown>>) {
  const resolveAuthorParts = (row: Record<string, unknown>) => {
    const name =
      (typeof row.author_name === "string" && row.author_name.trim()) ||
      (typeof row.publisher_name === "string" && row.publisher_name.trim()) ||
      "";
    const callsign = (typeof row.author_callsign === "string" && row.author_callsign.trim()) || "";
    const joined = [name, callsign].filter(Boolean).join(" ").trim();
    const fallbackText = typeof row.author === "string" && row.author.trim() ? row.author.trim() : "";
    return { name, callsign, text: joined || fallbackText };
  };
  return rows.map((row) => {
    const resolvedAuthor = resolveAuthorParts(row);
    return {
      id: row.id,
      title: row.title,
      body: row.body ?? row.text ?? row.content ?? "",
      text: row.text ?? row.body ?? row.content ?? "",
      content: row.content ?? row.body ?? row.text ?? "",
      priority: readNewsPriorityFromRow(row),
      kind: readNewsKindFromRow(row),
      author:
        resolvedAuthor.text ||
        ((typeof row.author_name === "string" && row.author_name.trim()) || "") ||
        ((typeof row.publisher_name === "string" && row.publisher_name.trim()) || ""),
      author_id:
        (typeof row.author_id === "string" && row.author_id.trim()) ||
        (typeof row.created_by === "string" && row.created_by.trim()) ||
        null,
      author_name: resolvedAuthor.name || null,
      author_callsign: resolvedAuthor.callsign || null,
      author_position: typeof row.author_position === "string" ? row.author_position : null,
      author_profile:
        resolvedAuthor.name || resolvedAuthor.callsign || (typeof row.author_position === "string" && row.author_position.trim())
          ? {
              id:
                (typeof row.author_id === "string" && row.author_id.trim()) ||
                (typeof row.created_by === "string" && row.created_by.trim()) ||
                "",
              name: resolvedAuthor.name || "",
              callsign: resolvedAuthor.callsign || "",
              position: typeof row.author_position === "string" ? row.author_position : null,
              avatar_url:
                normalizeAvatarStoragePath(
                  typeof row.author_avatar_url === "string"
                    ? row.author_avatar_url
                    : typeof (row.author_profile as { avatar_url?: unknown } | null)?.avatar_url === "string"
                      ? String((row.author_profile as { avatar_url: string }).avatar_url)
                      : null,
                ) ?? null,
            }
          : null,
      created_at: row.created_at,
      format: normalizeNewsTextStyle(row.format),
    };
  });
}

function fallbackSeedRows(limit: number) {
  return seedData.news.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    text: item.body,
    content: item.body,
    priority: item.priority,
    kind: item.kind ?? "news",
    author: item.author,
    created_at: item.createdAt,
    format: normalizeNewsTextStyle(item.textStyle),
  }));
}

function isMissingColumnError(message: string | undefined) {
  const m = (message || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function isMissingColumn(message: string, column: string) {
  const lower = message.toLowerCase();
  return (
    (lower.includes("column") && lower.includes(column.toLowerCase()) && lower.includes("does not exist")) ||
    (lower.includes("could not find") && lower.includes(column.toLowerCase()) && lower.includes("column"))
  );
}

function getNewsCreatorId(row: Record<string, unknown>) {
  return (
    (typeof row.author_id === "string" && row.author_id.trim()) ||
    (typeof row.created_by === "string" && row.created_by.trim()) ||
    (typeof row.user_id === "string" && row.user_id.trim()) ||
    (typeof row.created_by_user_id === "string" && row.created_by_user_id.trim()) ||
    ""
  );
}

function hasStoredAuthorPosition(item: {
  author_position?: unknown;
  author_profile?: { position?: unknown } | null;
}) {
  const direct = typeof item.author_position === "string" ? item.author_position.trim() : "";
  const profile = typeof item.author_profile?.position === "string" ? item.author_profile.position.trim() : "";
  return Boolean(direct || profile);
}

async function resolveNewsAuthorForInsert(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  session: SessionUser,
): Promise<{ author: string; author_position: string | null; created_by: string | null; author_id: string | null }> {
  let name = (session.name || "").trim();
  let callsign = (session.callsign || "").trim();
  let position = (session.position || "").trim();
  let appUserId = (session.id || "").trim() || null;

  const needsProfileLookup = (!name && !callsign) || !position || !appUserId;
  if (needsProfileLookup && session.id) {
    const { data, error } = await supabase
      .from("app_users")
      .select("id,name,callsign,position")
      .or(`id.eq.${session.id},auth_user_id.eq.${session.id}`)
      .limit(1)
      .maybeSingle();
    if (!error && data && typeof data === "object") {
      const r = data as Record<string, unknown>;
      if (typeof r.id === "string" && r.id.trim()) appUserId = r.id.trim();
      if (typeof r.name === "string" && r.name.trim()) name = r.name.trim();
      if (typeof r.callsign === "string" && r.callsign.trim()) callsign = r.callsign.trim();
      if (typeof r.position === "string" && r.position.trim()) position = r.position.trim();
    }
  }

  const label = [name, callsign].filter(Boolean).join(" ").trim() || name || callsign;
  return {
    author: label || "Пользователь",
    author_position: position || null,
    created_by: appUserId,
    author_id: appUserId,
  };
}

function authorHasIdentityExtras(user: {
  avatarUrl: string | null;
  nameColor: ReturnType<typeof normalizeProfileNameColor>;
  cosmetics: ReturnType<typeof mapIdentityCosmeticsFromRow>;
}) {
  return Boolean(
    user.avatarUrl ||
      user.nameColor ||
      user.cosmetics?.achievementNameColor ||
      user.cosmetics?.avatarFrame ||
      user.cosmetics?.bankOverlay,
  );
}

const NEWS_USER_SELECT_BASE = "id,auth_user_id,name,callsign,position,avatar_url";
const NEWS_USER_SELECT = `${NEWS_USER_SELECT_BASE},${IDENTITY_COSMETIC_USER_COLUMNS}`;
const NEWS_USER_SELECT_RESILIENT = `${NEWS_USER_SELECT_BASE},profile_name_color,${ACHIEVEMENT_COSMETIC_USER_COLUMNS}`;
const NEWS_USER_SELECT_FALLBACK = `${NEWS_USER_SELECT_BASE},profile_name_color`;

async function loadUsersByCreatorIds(
  supabase: ReturnType<typeof getServerSupabaseServiceClient>,
  ids: string[],
) {
  const queryUsers = async (select: string, column: "id" | "auth_user_id", filterIds: string[]) =>
    supabase.from("app_users").select(select).in(column, filterIds);

  const loadUsersSelect = async (column: "id" | "auth_user_id", filterIds: string[]) => {
    const attempts = [NEWS_USER_SELECT, NEWS_USER_SELECT_RESILIENT, NEWS_USER_SELECT_FALLBACK, NEWS_USER_SELECT_BASE];
    for (const select of attempts) {
      const usersQ = await queryUsers(select, column, filterIds);
      if (!usersQ.error && Array.isArray(usersQ.data)) {
        return usersQ.data as unknown as Array<Record<string, unknown>>;
      }
      if (usersQ.error && !isMissingColumnError(usersQ.error.message)) {
        return null;
      }
    }
    return null;
  };

  const [byIdRows, byAuthRows] = await Promise.all([
    loadUsersSelect("id", ids),
    loadUsersSelect("auth_user_id", ids),
  ]);
  if (!byIdRows && !byAuthRows) return null;
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of [...(byIdRows ?? []), ...(byAuthRows ?? [])]) {
    if (!row || typeof row !== "object") continue;
    const id = typeof row.id === "string" ? row.id : "";
    if (id) merged.set(id, row);
  }
  return [...merged.values()];
}

function needsAuthorEnrichment(
  item: ReturnType<typeof normalizeNewsRows>[number],
  row: Record<string, unknown>,
) {
  if (getNewsCreatorId(row)) return true;
  return isPlaceholderNewsAuthor(item?.author ?? "");
}

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 40), 200));

  try {
    const supabase = getServerSupabaseServiceClient();
    const q = await supabase.from("news").select("*").order("created_at", { ascending: false }).limit(limit);
    if (q.error) {
      const message = (q.error.message || "").toLowerCase();
      if (message.includes("relation") && message.includes("news")) {
        return Response.json({ ok: true, rows: fallbackSeedRows(limit), degraded: true });
      }
      return Response.json({ ok: false, error: q.error.message || "news_query_failed" }, { status: 500 });
    }
    const rows: Array<Record<string, unknown>> = ((q.data as unknown[]) || []) as Array<Record<string, unknown>>;
    if (!rows.length) return Response.json({ ok: true, rows: [] });
    const mapped = normalizeNewsRows(rows);

    const creatorIds = [
      ...new Set(rows.map((row) => getNewsCreatorId(row)).filter((id): id is string => Boolean(id))),
    ];

    if (!creatorIds.length) {
      return Response.json({ ok: true, rows: mapped });
    }

    const usersRows = await loadUsersByCreatorIds(supabase, creatorIds);
    if (!usersRows) {
      return Response.json({ ok: true, rows: mapped });
    }

    const userIds = usersRows
      .map((user) => (typeof user.id === "string" ? user.id : ""))
      .filter(Boolean);
    const cosmeticsMap = userIds.length ? await loadIdentityCosmeticsMap(userIds) : new Map();
    const topRankMap = await loadTopRankBadgeMap().catch(() => new Map<string, import("@/lib/achievements-catalog").TopRankBadgeId>());

    const usersMap = new Map<
      string,
      {
        name: string;
        callsign: string;
        position: string;
        avatarUrl: string | null;
        nameColor: ReturnType<typeof normalizeProfileNameColor>;
        cosmetics: NonNullable<ReturnType<typeof mapIdentityCosmeticsFromRow>>;
      }
    >();
    const usersByLabel = new Map<
      string,
      {
        name: string;
        callsign: string;
        position: string;
        avatarUrl: string | null;
        nameColor: ReturnType<typeof normalizeProfileNameColor>;
        cosmetics: NonNullable<ReturnType<typeof mapIdentityCosmeticsFromRow>>;
      }
    >();
    for (const user of usersRows) {
      const id = typeof user.id === "string" ? user.id : "";
      const authUserId = typeof user.auth_user_id === "string" ? user.auth_user_id : "";
      const cosmetics = mergeIdentityCosmetics(cosmeticsMap.get(id) ?? mapIdentityCosmeticsFromRow(user), {
        topRankBadge: id ? topRankMap.get(id) ?? null : null,
      });
      const person = {
        name: typeof user.name === "string" ? user.name.trim() : "",
        callsign: typeof user.callsign === "string" ? user.callsign.trim() : "",
        position: typeof user.position === "string" ? user.position.trim() : "",
        avatarUrl: normalizeAvatarStoragePath(typeof user.avatar_url === "string" ? user.avatar_url : null),
        nameColor: cosmetics.adminNameColor ?? null,
        cosmetics,
      };
      const label = [person.name, person.callsign].filter(Boolean).join(" ").trim().toLowerCase();
      if (label) usersByLabel.set(label, person);
      if (person.name) usersByLabel.set(person.name.trim().toLowerCase(), person);
      if (id) usersMap.set(id, person);
      if (authUserId) usersMap.set(authUserId, person);
    }

    const resolveAuthorUser = (item: (typeof mapped)[number], row: Record<string, unknown>) => {
      const candidateId = getNewsCreatorId(row);
      if (candidateId) {
        const byId = usersMap.get(candidateId);
        if (byId) return byId;
      }
      const authorLabel = typeof item.author === "string" ? item.author.trim().toLowerCase() : "";
      if (authorLabel) {
        const byAuthor = usersByLabel.get(authorLabel);
        if (byAuthor) return byAuthor;
      }
      const joined = [item.author_name, item.author_callsign]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(" ")
        .trim()
        .toLowerCase();
      if (joined) return usersByLabel.get(joined) ?? null;
      return null;
    };

    const withAuthorFallback = mapped.map((item, idx) => {
      const row = rows[idx];
      const fullReplace = needsAuthorEnrichment(item, row);
      const user = resolveAuthorUser(item, row);
      if (!user) return item;

      const candidateId = getNewsCreatorId(row) || item.author_id || null;
      const authorText = [user.name, user.callsign].filter(Boolean).join(" ").trim();
      const nextPosition = user.position || item.author_position || null;
      const existingAvatar = normalizeAvatarStoragePath(
        typeof item.author_profile?.avatar_url === "string" ? item.author_profile.avatar_url : null,
      );
      const nextAvatar = user.avatarUrl || existingAvatar;

      if (!fullReplace && hasStoredAuthorPosition(item)) {
        if (!authorHasIdentityExtras(user)) {
          return item;
        }
        return {
          ...item,
          author_profile: {
            ...(item.author_profile || {
              id: candidateId || "",
              name: item.author_name || "",
              callsign: item.author_callsign || "",
              position: item.author_position || null,
            }),
            avatar_url: user.avatarUrl || existingAvatar,
            nameColor: user.nameColor,
            cosmetics: user.cosmetics,
          },
        };
      }

      if (!fullReplace && !user.position && !authorHasIdentityExtras(user)) return item;

      return {
        ...item,
        author_id: candidateId,
        author: fullReplace ? authorText || item.author : item.author,
        author_name: user.name || item.author_name || null,
        author_callsign: user.callsign || item.author_callsign || null,
        author_position: nextPosition,
            author_profile: {
              id: candidateId || "",
              name: user.name || item.author_name || "",
              callsign: user.callsign || item.author_callsign || "",
              position: nextPosition,
              avatar_url: nextAvatar,
              nameColor: user.nameColor,
              cosmetics: user.cosmetics,
            },
      };
    });

    return Response.json({ ok: true, rows: withAuthorFallback });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_query_exception" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canManageNews(session)) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as {
      title?: unknown;
      body?: unknown;
      priority?: unknown;
      kind?: unknown;
      author?: unknown;
      textStyle?: unknown;
    };

    const title = String(body.title || "").trim();
    const text = String(body.body || "").trim();
    const priority = body.priority === "high" ? "high" : "normal";
    const kind = body.kind === "update" ? "update" : "news";
    const textStyle = normalizeNewsTextStyle(body.textStyle);
    const formatPayload = buildNewsFormatPayload(textStyle, kind, priority);

    if (!title || !text) {
      return Response.json({ ok: false, error: "title_and_body_required" }, { status: 400 });
    }

    const supabase = getServerSupabaseServiceClient();
    const resolvedAuthor = await resolveNewsAuthorForInsert(supabase, session);
    const author = resolvedAuthor.author;
    const author_position = resolvedAuthor.author_position;
    const created_by = resolvedAuthor.created_by;
    const author_id = resolvedAuthor.author_id;

    const insertPayload: Record<string, unknown> = {
      title,
      body: text,
      priority,
      author,
      format: formatPayload,
    };
    if (author_position) insertPayload.author_position = author_position;
    if (created_by) insertPayload.created_by = created_by;
    if (author_id) insertPayload.author_id = author_id;

    let insertQ = await supabase.from("news").insert(insertPayload);
    if (
      insertQ.error &&
      (isMissingColumn(insertQ.error.message || "", "author_position") ||
        isMissingColumn(insertQ.error.message || "", "created_by") ||
        isMissingColumn(insertQ.error.message || "", "author_id"))
    ) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        author,
        format: formatPayload,
      });
    }
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        author,
        format: formatPayload,
      });
    }

    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        author,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          author,
        });
      }
    }
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "body")) {
      insertQ = await supabase.from("news").insert({
        title,
        text,
        priority,
        author,
        format: formatPayload,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          author,
          format: formatPayload,
        });
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          priority,
          author,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            text,
            author,
          });
        }
      }
    }
    if (insertQ.error && isMissingColumn(insertQ.error.message || "", "author")) {
      insertQ = await supabase.from("news").insert({
        title,
        body: text,
        priority,
        format: formatPayload,
      });
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          format: formatPayload,
        });
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "format")) {
        insertQ = await supabase.from("news").insert({
          title,
          body: text,
          priority,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            body: text,
          });
        }
      }
      if (insertQ.error && isMissingColumn(insertQ.error.message || "", "body")) {
        insertQ = await supabase.from("news").insert({
          title,
          text,
          priority,
        });
        if (insertQ.error && isMissingColumn(insertQ.error.message || "", "priority")) {
          insertQ = await supabase.from("news").insert({
            title,
            text,
          });
        }
      }
    }
    if (insertQ.error) return Response.json({ ok: false, error: insertQ.error.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "news_create_exception" },
      { status: 500 },
    );
  }
}

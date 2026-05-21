import { getDb, type GlyphRow } from "@/lib/db";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";

export type GlyphDto = {
  id: number;
  char: string;
  author: string | null;
  scriptType: string | null;
  workTitle: string | null;
  imageUrl: string;
  thumbnailUrl: string | null;
  source: string | null;
  license: string | null;
  qualityScore: number;
  ownerUserId: string | null;
  visibility: string;
  likeCount: number;
  collectionCount: number;
  likedByMe: boolean;
};

export type SearchGlyphOptions = {
  q?: string;
  char?: string;
  author?: string;
  scriptType?: string;
  scriptTypes?: string[];
  perChar?: number;
  includePersonal?: boolean;
  includeAllPersonal?: boolean;
  userId?: string | null;
  resultScope?: "library" | "all" | "liked" | "personal" | "public";
  sort?: "popular" | "newest" | "author" | "script";
};

export type ScriptTypeStat = {
  label: string;
  count: number;
};

export function toGlyphDto(row: GlyphRow): GlyphDto {
  return {
    id: row.id,
    char: row.char,
    author: row.author,
    scriptType: row.script_type,
    workTitle: row.work_title,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url ?? null,
    source: row.source,
    license: row.license,
    qualityScore: row.quality_score,
    ownerUserId: row.owner_user_id ?? null,
    visibility: row.visibility ?? "public",
    likeCount: Number(row.like_count ?? 0),
    collectionCount: Number(row.collection_count ?? 0),
    likedByMe: Boolean(row.liked_by_me),
  };
}

export async function searchGlyphs(options: SearchGlyphOptions) {
  const db = await getDb();
  const q = options.q ?? "";
  const singleChar = options.char ?? "";
  const chars = singleChar
    ? [singleChar]
    : [...new Set(Array.from(q).filter((c) => c.trim() !== ""))];
  const unknownAuthorSql = `
    CASE
      WHEN author IS NULL OR trim(author) = '' THEN 1
      WHEN author IN ('佚名', '未知作者', '未知', '未標註') THEN 1
      ELSE 0
    END
  `;
  const scriptPrioritySql = `
    CASE
      WHEN script_type LIKE '%草%' THEN 0
      WHEN script_type LIKE '%行%' THEN 1
      WHEN script_type LIKE '%隸%' THEN 2
      WHEN script_type LIKE '%楷%' THEN 3
      ELSE 4
    END
  `;
  const glyphSelectSql = `
    g.*,
    ${glyphStatsSelectSql()}
  `;
  const popularityOrderSql = `
    (COALESCE(like_count, 0) + COALESCE(collection_count, 0) * 10) DESC,
    quality_score DESC,
    id DESC
  `;
  const newestOrderSql = "id DESC";
  const authorOrderSql = `${unknownAuthorSql}, COALESCE(author, ''), id DESC`;
  const scriptOrderSql = `${scriptPrioritySql}, COALESCE(script_type, ''), ${popularityOrderSql}`;
  const sortOrderSql =
    options.sort === "newest"
      ? newestOrderSql
      : options.sort === "author"
      ? authorOrderSql
      : options.sort === "script"
      ? scriptOrderSql
      : popularityOrderSql;
  const safeUserId = (options.userId ?? "").replace(/'/g, "''");
  const resultScope = options.resultScope ?? (options.includePersonal ? "all" : "library");
  const visibilityWhereSql = options.includeAllPersonal
    ? "1 = 1"
    : resultScope === "personal"
    ? safeUserId
      ? `g.owner_user_id = '${safeUserId}'`
      : "1 = 0"
    : resultScope === "public"
    ? `(g.owner_user_id IS NULL OR g.visibility = 'public')`
    : resultScope === "liked"
    ? safeUserId
      ? `(g.owner_user_id IS NULL OR g.visibility = 'public' OR g.owner_user_id = '${safeUserId}')`
      : "1 = 0"
    : resultScope === "all"
    ? `(g.owner_user_id IS NULL OR g.visibility = 'public' OR g.owner_user_id = '${safeUserId}')`
    : `g.owner_user_id IS NULL`;
  const currentUserId = options.userId ?? "";
  const selectedScriptTypes = [
    ...(options.scriptTypes ?? []),
    ...(options.scriptType ? [options.scriptType] : []),
  ].map((script) => script.trim()).filter(Boolean);

  if (chars.length === 0 && !options.author && selectedScriptTypes.length === 0) {
    const rows = db
      .prepare(`
        SELECT ${glyphSelectSql}
        FROM glyphs g
        ${glyphStatsJoinSql("g")}
        WHERE ${visibilityWhereSql}${resultScope === "liked" ? " AND my_like.user_id IS NOT NULL" : ""}
        ORDER BY ${sortOrderSql}
      `)
      .all(currentUserId) as GlyphRow[];
    return rows.map(toGlyphDto);
  }

  const where: string[] = [];
  const params: unknown[] = [];

  if (chars.length > 0) {
    where.push(`g.char IN (${chars.map(() => "?").join(",")})`);
    params.push(...chars);
  }

  if (options.author) {
    where.push("g.author LIKE ?");
    params.push(`%${options.author}%`);
  }

  if (selectedScriptTypes.length > 0) {
    const knownScriptTypes = selectedScriptTypes.filter((script) => script !== "未標註");
    const scriptWhere: string[] = [];
    if (selectedScriptTypes.includes("未標註")) {
      scriptWhere.push("(g.script_type IS NULL OR trim(g.script_type) = '')");
    }
    if (knownScriptTypes.length > 0) {
      scriptWhere.push(`g.script_type IN (${knownScriptTypes.map(() => "?").join(",")})`);
      params.push(...knownScriptTypes);
    }
    where.push(`(${scriptWhere.join(" OR ")})`);
  }
  where.push(visibilityWhereSql);
  if (resultScope === "liked") {
    where.push("my_like.user_id IS NOT NULL");
  }

  const perChar =
    typeof options.perChar === "number" && Number.isFinite(options.perChar)
      ? Math.max(Math.floor(options.perChar), 1)
      : null;
  const whereSql = where.length ? where.join(" AND ") : "1 = 1";

  const partitionSql = selectedScriptTypes.length > 0
    ? "char"
    : "char, COALESCE(script_type, '')";

  const rankedSql = `
    WITH glyph_with_stats AS (
      SELECT ${glyphSelectSql}
      FROM glyphs g
      ${glyphStatsJoinSql("g")}
      WHERE ${whereSql}
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY ${partitionSql}
          ORDER BY ${sortOrderSql}
        ) AS rn
      FROM glyph_with_stats
    )
    SELECT *
    FROM ranked
    WHERE rn <= ?
    ORDER BY CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END, char, rn
  `;
  const unlimitedSql = `
    SELECT ${glyphSelectSql}
    FROM glyphs g
    ${glyphStatsJoinSql("g")}
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END,
      char,
      ${sortOrderSql}
  `;

  const rows = perChar
    ? (db.prepare(rankedSql).all(currentUserId, ...params, perChar, q, q) as GlyphRow[])
    : (db.prepare(unlimitedSql).all(currentUserId, ...params, q, q) as GlyphRow[]);
  return rows.map(toGlyphDto);
}

export async function listScriptTypesForGlyphs(options: Pick<SearchGlyphOptions, "q" | "char" | "author" | "includePersonal" | "includeAllPersonal" | "userId" | "resultScope">) {
  const db = await getDb();
  const q = options.q ?? "";
  const singleChar = options.char ?? "";
  const chars = singleChar
    ? [singleChar]
    : [...new Set(Array.from(q).filter((c) => c.trim() !== ""))];

  if (chars.length === 0) return [];

  const where: string[] = [`char IN (${chars.map(() => "?").join(",")})`];
  const params: unknown[] = [...chars];

  if (options.author) {
    where.push("author LIKE ?");
    params.push(`%${options.author}%`);
  }

  const safeUserId = (options.userId ?? "").replace(/'/g, "''");
  const resultScope = options.resultScope ?? (options.includePersonal ? "all" : "library");
  if (options.includeAllPersonal) {
    where.push("1 = 1");
  } else if (resultScope === "personal") {
    where.push(safeUserId ? `owner_user_id = '${safeUserId}'` : "1 = 0");
  } else if (resultScope === "public") {
    where.push(`(owner_user_id IS NULL OR visibility = 'public')`);
  } else if (resultScope === "liked") {
    where.push(safeUserId ? `(owner_user_id IS NULL OR visibility = 'public' OR owner_user_id = '${safeUserId}')` : "1 = 0");
    if (safeUserId) {
      where.push(`EXISTS (SELECT 1 FROM glyph_likes gl WHERE gl.glyph_id = glyphs.id AND gl.user_id = '${safeUserId}')`);
    }
  } else if (resultScope === "all") {
    where.push(`(owner_user_id IS NULL OR visibility = 'public' OR owner_user_id = '${safeUserId}')`);
  } else {
    where.push(`owner_user_id IS NULL`);
  }

  const rows = db.prepare(`
    SELECT
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END AS label,
      COUNT(*) AS count
    FROM glyphs
    WHERE ${where.join(" AND ")}
    GROUP BY
      CASE
        WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
        ELSE script_type
      END
    ORDER BY
      CASE
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) IN ('未標註', '未知書體') THEN 1
        ELSE 0
      END,
      CASE
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%草%' THEN 0
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%行%' THEN 1
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%隸%' THEN 2
        WHEN (
          CASE
            WHEN script_type IS NULL OR trim(script_type) = '' THEN '未標註'
            ELSE script_type
          END
        ) LIKE '%楷%' THEN 3
        ELSE 4
      END,
      count DESC,
      label
  `).all(...params) as ScriptTypeStat[];

  return rows;
}

export function groupGlyphsByChar(glyphs: GlyphDto[]) {
  return glyphs.reduce<Record<string, GlyphDto[]>>((acc, glyph) => {
    acc[glyph.char] ??= [];
    acc[glyph.char].push(glyph);
    return acc;
  }, {});
}

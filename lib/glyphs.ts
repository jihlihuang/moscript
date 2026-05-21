import { getDb, type GlyphRow } from "@/lib/db";

export type GlyphDto = {
  id: number;
  char: string;
  author: string | null;
  scriptType: string | null;
  workTitle: string | null;
  imageUrl: string;
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
  perChar?: number;
  includePersonal?: boolean;
  includeAllPersonal?: boolean;
  userId?: string | null;
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
    COALESCE(likes.like_count, 0) AS like_count,
    COALESCE(collections.collection_count, 0) AS collection_count,
    CASE WHEN my_like.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
  `;
  const glyphStatsJoinSql = `
    LEFT JOIN (
      SELECT glyph_id, COUNT(*) AS like_count
      FROM glyph_likes
      GROUP BY glyph_id
    ) likes ON likes.glyph_id = g.id
    LEFT JOIN (
      SELECT glyph_id, COUNT(DISTINCT collection_id) AS collection_count
      FROM collection_items
      GROUP BY glyph_id
    ) collections ON collections.glyph_id = g.id
    LEFT JOIN glyph_likes my_like ON my_like.glyph_id = g.id AND my_like.user_id = ?
  `;
  const popularityOrderSql = `
    (COALESCE(like_count, 0) + COALESCE(collection_count, 0) * 10) DESC,
    quality_score DESC,
    id DESC
  `;
  const safeUserId = (options.userId ?? "").replace(/'/g, "''");
  const visibilityWhereSql = options.includeAllPersonal
    ? "1 = 1"
    : options.includePersonal
    ? `(g.owner_user_id IS NULL OR g.visibility = 'public' OR g.owner_user_id = '${safeUserId}')`
    : `g.owner_user_id IS NULL`;
  const currentUserId = options.userId ?? "";

  if (chars.length === 0 && !options.author && !options.scriptType) {
    const rows = db
      .prepare(`
        SELECT ${glyphSelectSql}
        FROM glyphs g
        ${glyphStatsJoinSql}
        WHERE ${visibilityWhereSql}
        ORDER BY ${scriptPrioritySql}, ${unknownAuthorSql}, ${popularityOrderSql}
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

  if (options.scriptType === "未標註") {
    where.push("(g.script_type IS NULL OR trim(g.script_type) = '')");
  } else if (options.scriptType) {
    where.push("g.script_type = ?");
    params.push(options.scriptType);
  }
  where.push(visibilityWhereSql);

  const perChar =
    typeof options.perChar === "number" && Number.isFinite(options.perChar)
      ? Math.max(Math.floor(options.perChar), 1)
      : null;
  const whereSql = where.length ? where.join(" AND ") : "1 = 1";

  const partitionSql = options.scriptType
    ? "char"
    : "char, COALESCE(script_type, '')";

  const rankedSql = `
    WITH glyph_with_stats AS (
      SELECT ${glyphSelectSql}
      FROM glyphs g
      ${glyphStatsJoinSql}
      WHERE ${whereSql}
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY ${partitionSql}
          ORDER BY ${unknownAuthorSql}, ${popularityOrderSql}
        ) AS rn
      FROM glyph_with_stats
    )
    SELECT *
    FROM ranked
    WHERE rn <= ?
    ORDER BY CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END, char, ${scriptPrioritySql}, rn
  `;
  const unlimitedSql = `
    SELECT ${glyphSelectSql}
    FROM glyphs g
    ${glyphStatsJoinSql}
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END,
      char,
      ${scriptPrioritySql},
      ${unknownAuthorSql},
      COALESCE(script_type, ''),
      ${popularityOrderSql}
  `;

  const rows = perChar
    ? (db.prepare(rankedSql).all(currentUserId, ...params, perChar, q, q) as GlyphRow[])
    : (db.prepare(unlimitedSql).all(currentUserId, ...params, q, q) as GlyphRow[]);
  return rows.map(toGlyphDto);
}

export async function listScriptTypesForGlyphs(options: Pick<SearchGlyphOptions, "q" | "char" | "author" | "includePersonal" | "includeAllPersonal" | "userId">) {
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
  if (options.includeAllPersonal) {
    where.push("1 = 1");
  } else if (options.includePersonal) {
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

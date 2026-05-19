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
};

export type SearchGlyphOptions = {
  q?: string;
  char?: string;
  author?: string;
  scriptType?: string;
  perChar?: number;
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

  if (chars.length === 0 && !options.author && !options.scriptType) {
    const rows = db
      .prepare(`
        SELECT *
        FROM glyphs
        ORDER BY ${unknownAuthorSql}, id DESC
      `)
      .all() as GlyphRow[];
    return rows.map(toGlyphDto);
  }

  const where: string[] = [];
  const params: unknown[] = [];

  if (chars.length > 0) {
    where.push(`char IN (${chars.map(() => "?").join(",")})`);
    params.push(...chars);
  }

  if (options.author) {
    where.push("author LIKE ?");
    params.push(`%${options.author}%`);
  }

  if (options.scriptType === "未標註") {
    where.push("(script_type IS NULL OR trim(script_type) = '')");
  } else if (options.scriptType) {
    where.push("script_type = ?");
    params.push(options.scriptType);
  }

  const perChar =
    typeof options.perChar === "number" && Number.isFinite(options.perChar)
      ? Math.max(Math.floor(options.perChar), 1)
      : null;
  const whereSql = where.length ? where.join(" AND ") : "1 = 1";

  const partitionSql = options.scriptType
    ? "char"
    : "char, COALESCE(script_type, '')";

  const rankedSql = `
    WITH ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY ${partitionSql}
          ORDER BY ${unknownAuthorSql}, quality_score DESC, id DESC
        ) AS rn
      FROM glyphs
      WHERE ${whereSql}
    )
    SELECT *
    FROM ranked
    WHERE rn <= ?
    ORDER BY CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END, char, rn
  `;
  const unlimitedSql = `
    SELECT *
    FROM glyphs
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN ? = '' THEN 999 ELSE instr(?, char) END,
      char,
      ${unknownAuthorSql},
      COALESCE(script_type, ''),
      quality_score DESC,
      id DESC
  `;

  const rows = perChar
    ? (db.prepare(rankedSql).all(...params, perChar, q, q) as GlyphRow[])
    : (db.prepare(unlimitedSql).all(...params, q, q) as GlyphRow[]);
  return rows.map(toGlyphDto);
}

export async function listScriptTypesForGlyphs(options: Pick<SearchGlyphOptions, "q" | "char" | "author">) {
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
    ORDER BY count DESC, label
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

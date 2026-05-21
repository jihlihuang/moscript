export function glyphStatsSelectSql() {
  return `
    COALESCE(like_stats.like_count, 0) AS like_count,
    COALESCE(collection_stats.collection_count, 0) AS collection_count,
    CASE WHEN my_like.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
  `;
}

export function glyphStatsJoinSql(glyphAlias = "g") {
  return `
    LEFT JOIN (
      SELECT glyph_id, COUNT(*) AS like_count
      FROM glyph_likes
      GROUP BY glyph_id
    ) like_stats ON like_stats.glyph_id = ${glyphAlias}.id
    LEFT JOIN (
      SELECT glyph_id, COUNT(DISTINCT collection_id) AS collection_count
      FROM collection_items
      GROUP BY glyph_id
    ) collection_stats ON collection_stats.glyph_id = ${glyphAlias}.id
    LEFT JOIN glyph_likes my_like ON my_like.glyph_id = ${glyphAlias}.id AND my_like.user_id = ?
  `;
}

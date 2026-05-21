import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(48, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 24) || 24));
  const db = await getDb();
  const rows = db.prepare(`
    SELECT
      g.id,
      g.char,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      g.thumbnail_url,
      COALESCE(g.visibility, 'public') AS visibility,
      g.created_at,
      ${glyphStatsSelectSql()}
    FROM glyphs g
    ${glyphStatsJoinSql("g")}
    WHERE g.owner_user_id = ?
    ORDER BY g.id DESC
    LIMIT ? OFFSET ?
  `).all(user.id, user.id, limit + 1, offset) as {
    id: number;
    char: string;
    author: string | null;
    script_type: string | null;
    work_title: string | null;
    image_url: string;
    thumbnail_url: string | null;
    visibility: "public" | "private";
    created_at: string;
    like_count: number;
    collection_count: number;
  }[];

  const pageRows = rows.slice(0, limit);
  return NextResponse.json({
    glyphs: pageRows.map((glyph) => ({
      id: glyph.id,
      char: glyph.char,
      author: glyph.author,
      scriptType: glyph.script_type,
      workTitle: glyph.work_title,
      imageUrl: glyph.image_url,
      thumbnailUrl: glyph.thumbnail_url,
      visibility: glyph.visibility === "private" ? "private" : "public",
      likeCount: glyph.like_count,
      collectionCount: glyph.collection_count,
      createdAt: glyph.created_at,
    })),
    hasMore: rows.length > limit,
  });
}

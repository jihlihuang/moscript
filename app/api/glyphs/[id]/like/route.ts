import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { canAccessGlyph } from "@/lib/glyph-access";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入後再按讚");

  const { id } = await params;
  const glyphId = Number(id);
  if (!Number.isInteger(glyphId)) {
    return NextResponse.json({ error: "字圖 ID 不正確" }, { status: 400 });
  }

  const db = await getDb();
  const glyph = db.prepare("SELECT id, owner_user_id, visibility FROM glyphs WHERE id = ?").get(glyphId) as
    | { id: number; owner_user_id: string | null; visibility: string | null }
    | undefined;
  if (!glyph) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }
  if (!canAccessGlyph(glyph, user)) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  const liked = db.prepare("SELECT 1 FROM glyph_likes WHERE glyph_id = ? AND user_id = ?").get(glyphId, user.id);
  if (liked) {
    db.prepare("DELETE FROM glyph_likes WHERE glyph_id = ? AND user_id = ?").run(glyphId, user.id);
  } else {
    db.prepare(`
      INSERT INTO glyph_likes (glyph_id, user_id, user_email)
      VALUES (?, ?, ?)
    `).run(glyphId, user.id, user.email);
  }

  await syncDbToBlob();

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM glyph_likes WHERE glyph_id = ?) AS like_count,
      (SELECT COUNT(DISTINCT collection_id) FROM collection_items WHERE glyph_id = ?) AS collection_count,
      (SELECT COUNT(*) FROM glyph_likes WHERE glyph_id = ? AND user_id = ?) AS liked_by_me
  `).get(glyphId, glyphId, glyphId, user.id) as { like_count: number; collection_count: number; liked_by_me: number };

  return NextResponse.json({
    liked: Boolean(stats.liked_by_me),
    likeCount: stats.like_count,
    collectionCount: stats.collection_count,
  });
}

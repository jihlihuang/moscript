import { NextRequest, NextResponse } from "next/server";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { getDb, syncDbToBlob } from "@/lib/db";
import { glyphImageUrlForAccess } from "@/lib/glyph-access";
import { glyphStatsJoinSql, glyphStatsSelectSql } from "@/lib/glyph-stats";
import { deleteGlyphImageByUrl } from "@/lib/glyph-upload";

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
    owner_user_id?: string | null;
  }[];

  const pageRows = rows.slice(0, limit);
  return NextResponse.json({
    glyphs: pageRows.map((glyph) => ({
      id: glyph.id,
      char: glyph.char,
      author: glyph.author,
      scriptType: glyph.script_type,
      workTitle: glyph.work_title,
      imageUrl: glyphImageUrlForAccess({ ...glyph, owner_user_id: user.id }, "image") ?? glyph.image_url,
      thumbnailUrl: glyphImageUrlForAccess({ ...glyph, owner_user_id: user.id }, "thumbnail"),
      visibility: glyph.visibility === "private" ? "private" : "public",
      likeCount: glyph.like_count,
      collectionCount: glyph.collection_count,
      createdAt: glyph.created_at,
    })),
    hasMore: rows.length > limit,
  });
}

function normalizeIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function PATCH(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const ids = normalizeIds(body.ids);
  if (ids.length === 0) {
    return NextResponse.json({ error: "請先選擇字圖" }, { status: 400 });
  }

  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  const ownedGlyphs = db.prepare(`
    SELECT id, image_url, thumbnail_url
    FROM glyphs
    WHERE owner_user_id = ? AND id IN (${placeholders})
  `).all(user.id, ...ids) as { id: number; image_url: string; thumbnail_url: string | null }[];
  const ownedIds = ownedGlyphs.map((glyph) => glyph.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "找不到可管理的個人字圖" }, { status: 404 });
  }

  if (body.action === "delete") {
    const deletePlaceholders = ownedIds.map(() => "?").join(",");
    const info = db.prepare(`DELETE FROM glyphs WHERE owner_user_id = ? AND id IN (${deletePlaceholders})`).run(user.id, ...ownedIds);
    await syncDbToBlob();
    if (info.changes > 0) {
      await Promise.all(
        ownedGlyphs.map(async (glyph) => {
          await deleteGlyphImageByUrl(glyph.image_url);
          await deleteGlyphImageByUrl(glyph.thumbnail_url);
        })
      );
    }
    return NextResponse.json({ ok: true, changes: info.changes, ids: ownedIds });
  }

  if (body.action === "visibility") {
    const visibility = body.visibility === "private" ? "private" : "public";
    const updatePlaceholders = ownedIds.map(() => "?").join(",");
    const info = db.prepare(`UPDATE glyphs SET visibility = ? WHERE owner_user_id = ? AND id IN (${updatePlaceholders})`).run(visibility, user.id, ...ownedIds);
    await syncDbToBlob();
    return NextResponse.json({ ok: true, changes: info.changes, ids: ownedIds, visibility });
  }

  if (body.action === "metadata") {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof body.author === "string") {
      updates.push("author = ?");
      values.push(body.author.trim() || null);
    }
    if (typeof body.scriptType === "string") {
      updates.push("script_type = ?");
      values.push(body.scriptType.trim() || null);
    }
    if (typeof body.workTitle === "string") {
      updates.push("work_title = ?");
      values.push(body.workTitle.trim() || null);
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: "請至少填寫一個要更新的欄位" }, { status: 400 });
    }

    const updatePlaceholders = ownedIds.map(() => "?").join(",");
    const info = db.prepare(`
      UPDATE glyphs
      SET ${updates.join(", ")}
      WHERE owner_user_id = ? AND id IN (${updatePlaceholders})
    `).run(...values, user.id, ...ownedIds);
    await syncDbToBlob();
    return NextResponse.json({
      ok: true,
      changes: info.changes,
      ids: ownedIds,
      author: typeof body.author === "string" ? body.author.trim() || null : undefined,
      scriptType: typeof body.scriptType === "string" ? body.scriptType.trim() || null : undefined,
      workTitle: typeof body.workTitle === "string" ? body.workTitle.trim() || null : undefined,
    });
  }

  return NextResponse.json({ error: "不支援的批次操作" }, { status: 400 });
}

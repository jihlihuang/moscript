import { NextRequest, NextResponse } from "next/server";
import { getDb, type GlyphRow, type GlyphSetRow, syncDbToBlob } from "@/lib/db";
import { getCurrentUser, isAdminAllowed } from "@/lib/auth";
import { toGlyphDto } from "@/lib/glyphs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();

  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set) return NextResponse.json({ error: "找不到字組" }, { status: 404 });

  // 只有擁有者可以查看私人字組的原圖（成員字圖依各字圖自身的 visibility 控制）
  const canSeeSource = !set.owner_user_id || set.owner_user_id === user?.id || (user ? isAdminAllowed(user) : false);

  const members = db.prepare(`
    SELECT * FROM glyphs
    WHERE set_id = ?
      AND (visibility = 'public' OR owner_user_id = ?)
    ORDER BY COALESCE(set_position, id), id ASC
  `).all(id, user?.id ?? "") as GlyphRow[];

  return NextResponse.json({
    id: set.id,
    name: set.name,
    sourceImageUrl: canSeeSource ? set.source_image_url : null,
    hasSource: !!set.source_image_url,
    ownerUserId: set.owner_user_id,
    createdAt: set.created_at,
    members: members.map(toGlyphDto),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !isAdminAllowed(user)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set) return NextResponse.json({ error: "找不到字組" }, { status: 404 });

  const body = await req.json() as { name?: string; memberOrder?: number[] };
  const name = typeof body.name === "string" ? body.name.trim() || null : undefined;

  if (name !== undefined) {
    db.prepare("UPDATE glyph_sets SET name = ? WHERE id = ?").run(name, id);
  }

  const body2 = body as { name?: string; removeGlyphIds?: number[]; addGlyphIds?: number[]; memberOrder?: number[] };

  // 從字組移除指定字圖（set_id 設為 NULL）
  if (Array.isArray(body2.removeGlyphIds) && body2.removeGlyphIds.length > 0) {
    const ids = body2.removeGlyphIds.filter(Number.isFinite);
    if (ids.length > 0) {
      db.prepare(
        `UPDATE glyphs SET set_id = NULL, set_position = NULL WHERE id IN (${ids.map(() => "?").join(",")}) AND set_id = ?`
      ).run(...ids, id);
    }
  }

  // 加入字圖到字組
  if (Array.isArray(body2.addGlyphIds) && body2.addGlyphIds.length > 0) {
    const ids = body2.addGlyphIds.filter(Number.isFinite);
    if (ids.length > 0) {
      const maxPosition = db.prepare("SELECT COALESCE(MAX(set_position), COUNT(*), 0) AS value FROM glyphs WHERE set_id = ?").get(id) as { value: number };
      const addStmt = db.prepare("UPDATE glyphs SET set_id = ?, set_position = ? WHERE id = ?");
      let nextPosition = Number(maxPosition.value ?? 0) + 1;
      const addAll = db.transaction(() => {
        for (const gid of ids) {
          addStmt.run(id, nextPosition, gid);
          nextPosition += 1;
        }
      });
      addAll();
    }
  }

  if (Array.isArray(body2.memberOrder) && body2.memberOrder.length > 0) {
    const ids = [...new Set(body2.memberOrder.map(Number).filter(Number.isFinite))];
    const existing = db.prepare(`SELECT id FROM glyphs WHERE set_id = ?`).all(id) as { id: number }[];
    const existingIds = new Set(existing.map((row) => row.id));
    const orderedIds = ids.filter((glyphId) => existingIds.has(glyphId));
    if (orderedIds.length !== existingIds.size) {
      return NextResponse.json({ error: "排序清單與字組成員不一致" }, { status: 400 });
    }
    const updatePosition = db.prepare("UPDATE glyphs SET set_position = ? WHERE id = ? AND set_id = ?");
    const reorder = db.transaction(() => {
      orderedIds.forEach((glyphId, index) => {
        updatePosition.run(index + 1, glyphId, id);
      });
    });
    reorder();
  }

  await syncDbToBlob();
  return NextResponse.json({ id: Number(id), name: name ?? set.name });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !isAdminAllowed(user)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();

  // 先解除所有字圖的字組綁定，再刪字組
  db.prepare("UPDATE glyphs SET set_id = NULL, set_position = NULL WHERE set_id = ?").run(id);
  db.prepare("DELETE FROM glyph_sets WHERE id = ?").run(id);

  await syncDbToBlob();
  return NextResponse.json({ deleted: Number(id) });
}

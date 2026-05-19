import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const user = requireRequestUser(_req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = await getDb();

  const collection = db.prepare(`
    SELECT id, title, text, created_at
    FROM collections
    WHERE id = ? AND user_id = ?
  `).get(id, user.id);

  if (!collection) {
    return NextResponse.json({ error: "找不到集字作品" }, { status: 404 });
  }

  const items = db.prepare(`
    SELECT
      ci.position,
      ci.char,
      g.id as glyph_id,
      g.author,
      g.script_type,
      g.work_title,
      g.image_url,
      g.source,
      g.license
    FROM collection_items ci
    JOIN glyphs g ON g.id = ci.glyph_id
    WHERE ci.collection_id = ?
    ORDER BY ci.position ASC
  `).all(id);

  return NextResponse.json({ collection, items });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = requireRequestUser(_req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = await getDb();

  const collection = db.prepare(`
    SELECT id
    FROM collections
    WHERE id = ? AND user_id = ?
  `).get(id, user.id);

  if (!collection) {
    return NextResponse.json({ error: "找不到集字作品" }, { status: 404 });
  }

  db.prepare(`DELETE FROM collection_items WHERE collection_id = ?`).run(id);
  db.prepare(`DELETE FROM collections WHERE id = ?`).run(id);

  return NextResponse.json({ success: true });
}

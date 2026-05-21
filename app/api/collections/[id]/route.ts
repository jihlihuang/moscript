import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { glyphImageUrlForAccess } from "@/lib/glyph-access";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

type IncomingItem = {
  glyphId: number;
  char: string;
  position: number;
};

function normalizeItems(items: IncomingItem[]) {
  return items
    .map((item) => ({
      glyphId: Number(item.glyphId),
      char: String(item.char || "").trim(),
      position: Number(item.position),
    }))
    .filter((item) => Number.isInteger(item.glyphId) && Number.isInteger(item.position) && item.char)
    .sort((a, b) => a.position - b.position);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const db = await getDb();

  const collection = db.prepare(`
    SELECT id, title, text, display_direction, created_at
    FROM collections
    WHERE id = ?
  `).get(id);

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
      g.thumbnail_url,
      g.owner_user_id,
      g.visibility,
      g.source,
      g.license
    FROM collection_items ci
    JOIN glyphs g ON g.id = ci.glyph_id
    WHERE ci.collection_id = ?
    ORDER BY ci.position ASC
  `).all(id) as {
    position: number;
    char: string;
    glyph_id: number;
    author: string | null;
    script_type: string | null;
    work_title: string | null;
    image_url: string;
    thumbnail_url: string | null;
    owner_user_id: string | null;
    visibility: string | null;
    source: string | null;
    license: string | null;
  }[];

  return NextResponse.json({
    collection,
    items: items.map((item) => ({
      ...item,
      image_url: glyphImageUrlForAccess({
        id: item.glyph_id,
        owner_user_id: item.owner_user_id,
        visibility: item.visibility,
        image_url: item.image_url,
        thumbnail_url: item.thumbnail_url,
      }, "image") ?? item.image_url,
      thumbnail_url: glyphImageUrlForAccess({
        id: item.glyph_id,
        owner_user_id: item.owner_user_id,
        visibility: item.visibility,
        image_url: item.image_url,
        thumbnail_url: item.thumbnail_url,
      }, "thumbnail"),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const displayDirection = body.displayDirection;
  const hasItems = Array.isArray(body.items);
  const items = hasItems ? normalizeItems(body.items as IncomingItem[]) : [];
  const title = typeof body.title === "string" ? body.title.trim() : null;
  const text = typeof body.text === "string" ? body.text.trim() : null;

  if (displayDirection !== undefined && displayDirection !== "horizontal" && displayDirection !== "vertical") {
    return NextResponse.json({ error: "排列設定不正確" }, { status: 400 });
  }
  if (hasItems && (!text || items.length === 0)) {
    return NextResponse.json({ error: "請至少選擇一個集字字圖" }, { status: 400 });
  }

  const db = await getDb();
  const update = db.transaction(() => {
    const collection = db.prepare("SELECT id FROM collections WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!collection) return { changes: 0 };

    const updates: string[] = [];
    const values: unknown[] = [];
    if (title !== null) {
      updates.push("title = ?");
      values.push(title || text || "未命名集字作品");
    }
    if (text !== null) {
      updates.push("text = ?");
      values.push(text);
    }
    if (displayDirection === "horizontal" || displayDirection === "vertical") {
      updates.push("display_direction = ?");
      values.push(displayDirection);
    }

    if (updates.length > 0) {
      db.prepare(`UPDATE collections SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values, id, user.id);
    }

    if (hasItems) {
      db.prepare("DELETE FROM collection_items WHERE collection_id = ?").run(id);
      const insertItem = db.prepare(`
        INSERT INTO collection_items (collection_id, glyph_id, position, char)
        VALUES (?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(id, item.glyphId, item.position, item.char);
      }
    }

    return { changes: 1 };
  });

  const result = update();
  if (result.changes === 0) {
    return NextResponse.json({ error: "找不到集字作品" }, { status: 404 });
  }

  await syncDbToBlob();
  return NextResponse.json({ success: true, url: `/collections/${id}` });
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
  await syncDbToBlob();

  return NextResponse.json({ success: true });
}

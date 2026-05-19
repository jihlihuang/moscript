import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

type IncomingItem = {
  glyphId: number;
  char: string;
  position: number;
};

export async function GET(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const db = await getDb();
  const rows = db.prepare(`
    SELECT id, title, text, created_at
    FROM collections
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(user.id);

  return NextResponse.json({ collections: rows });
}

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const title = String(body.title || body.text || "未命名集字作品").trim();
  const text = String(body.text || "").trim();
  const items = (body.items || []) as IncomingItem[];

  if (!text || items.length === 0) {
    return NextResponse.json(
      { error: "請至少選擇一個集字字圖" },
      { status: 400 }
    );
  }

  const db = await getDb();

  const save = db.transaction(() => {
    const collection = db
      .prepare("INSERT INTO collections (user_id, user_email, user_name, title, text) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.name, title, text);

    const collectionId = Number(collection.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO collection_items (collection_id, glyph_id, position, char)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(collectionId, item.glyphId, item.position, item.char);
    }

    return collectionId;
  });

  const id = save();
  await syncDbToBlob();
  return NextResponse.json({ id, url: `/collections/${id}` });
}

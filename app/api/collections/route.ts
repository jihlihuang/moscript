import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { MAX_COLLECTION_ITEMS, MAX_COLLECTION_TEXT_LEN, MAX_COLLECTION_TITLE_LEN, truncate } from "@/lib/validation";

export const runtime = "nodejs";

type IncomingItem = {
  glyphId: number;
  char: string;
  position: number;
};

type NormalizedItem = {
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

function itemsSignature(items: NormalizedItem[]) {
  return JSON.stringify(items.map((item) => [item.position, item.char, item.glyphId]));
}

export async function GET(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const db = await getDb();
  const rows = db.prepare(`
    SELECT id, title, text, display_direction, created_at
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
  const title = truncate(String(body.title || body.text || "未命名集字作品").trim(), MAX_COLLECTION_TITLE_LEN);
  const text = truncate(String(body.text || "").trim(), MAX_COLLECTION_TEXT_LEN);
  const displayDirection = body.displayDirection === "vertical" ? "vertical" : "horizontal";
  const items = normalizeItems((body.items || []) as IncomingItem[]).slice(0, MAX_COLLECTION_ITEMS);

  if (!text || items.length === 0) {
    return NextResponse.json(
      { error: "請至少選擇一個集字字圖" },
      { status: 400 }
    );
  }

  const db = await getDb();

  const save = db.transaction(() => {
    const incomingSignature = itemsSignature(items);
    const candidates = db.prepare(`
      SELECT c.id
      FROM collections c
      JOIN (
        SELECT collection_id, COUNT(*) AS item_count
        FROM collection_items
        GROUP BY collection_id
      ) ci_count ON ci_count.collection_id = c.id
      WHERE c.user_id = ? AND c.text = ? AND ci_count.item_count = ?
      ORDER BY c.id DESC
      LIMIT 100
    `).all(user.id, text, items.length) as { id: number }[];

    const getCandidateItems = db.prepare(`
      SELECT glyph_id AS glyphId, char, position
      FROM collection_items
      WHERE collection_id = ?
      ORDER BY position ASC
    `);

    for (const candidate of candidates) {
      const candidateItems = getCandidateItems.all(candidate.id) as NormalizedItem[];
      if (itemsSignature(candidateItems) === incomingSignature) {
        return { id: candidate.id, duplicate: true };
      }
    }

    const collection = db
      .prepare("INSERT INTO collections (user_id, user_email, user_name, title, text, display_direction) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.name, title, text, displayDirection);

    const collectionId = Number(collection.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO collection_items (collection_id, glyph_id, position, char)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(collectionId, item.glyphId, item.position, item.char);
    }

    return { id: collectionId, duplicate: false };
  });

  const result = save();
  if (!result.duplicate) {
    await syncDbToBlob();
  }
  return NextResponse.json({
    id: result.id,
    url: `/collections/${result.id}`,
    duplicate: result.duplicate,
  });
}

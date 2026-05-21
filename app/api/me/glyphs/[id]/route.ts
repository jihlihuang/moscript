import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { deleteGlyphImageByUrl } from "@/lib/glyph-upload";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

async function getOwnedGlyph(id: number, userId: string) {
  const db = await getDb();
  const glyph = db.prepare("SELECT id, owner_user_id, image_url FROM glyphs WHERE id = ?").get(id) as
    | { id: number; owner_user_id: string | null; image_url: string }
    | undefined;
  if (!glyph || glyph.owner_user_id !== userId) return null;
  return { db, glyph };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const glyphId = Number(id);
  if (!Number.isInteger(glyphId)) {
    return NextResponse.json({ error: "字圖 ID 不正確" }, { status: 400 });
  }

  const owned = await getOwnedGlyph(glyphId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "找不到可管理的個人字圖" }, { status: 404 });
  }

  const body = await req.json();
  const visibility = body.visibility === "private" ? "private" : "public";
  owned.db.prepare("UPDATE glyphs SET visibility = ? WHERE id = ?").run(visibility, glyphId);
  await syncDbToBlob();

  return NextResponse.json({ ok: true, visibility });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const glyphId = Number(id);
  if (!Number.isInteger(glyphId)) {
    return NextResponse.json({ error: "字圖 ID 不正確" }, { status: 400 });
  }

  const owned = await getOwnedGlyph(glyphId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "找不到可管理的個人字圖" }, { status: 404 });
  }

  const info = owned.db.prepare("DELETE FROM glyphs WHERE id = ? AND owner_user_id = ?").run(glyphId, user.id);
  await syncDbToBlob();
  if (info.changes > 0) {
    await deleteGlyphImageByUrl(owned.glyph.image_url);
  }

  return NextResponse.json({ ok: true, changes: info.changes });
}

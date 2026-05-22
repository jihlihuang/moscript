import { NextRequest, NextResponse } from "next/server";
import { getDb, type GlyphRow, syncDbToBlob } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { canAccessGlyph } from "@/lib/glyph-access";
import { toGlyphDto } from "@/lib/glyphs";
import { deleteGlyphImageByUrl, onlyChinese } from "@/lib/glyph-upload";
import { MAX_AUTHOR_LEN, MAX_LICENSE_LEN, MAX_SCRIPT_TYPE_LEN, MAX_SOURCE_LEN, MAX_WORK_TITLE_LEN, truncate } from "@/lib/validation";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);

  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare("SELECT * FROM glyphs WHERE id = ?").get(id) as GlyphRow | undefined;
  if (!glyph) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }
  if (!canAccessGlyph(glyph, user)) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  return NextResponse.json(toGlyphDto(glyph));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const { id } = await params;
  const body = await req.json();
  const char = onlyChinese(String(body.char ?? "")).slice(0, 1);

  if (!char) {
    return NextResponse.json({ error: "char 為必填，且必須是單一中文字" }, { status: 400 });
  }

  const db = await getDb();
  db.prepare(`
    UPDATE glyphs
    SET char = ?, author = ?, script_type = ?, work_title = ?, source = ?, license = ?, quality_score = ?
    WHERE id = ?
  `).run(
    char,
    truncate(String(body.author ?? "").trim(), MAX_AUTHOR_LEN) || null,
    truncate(String(body.scriptType ?? "").trim(), MAX_SCRIPT_TYPE_LEN) || null,
    truncate(String(body.workTitle ?? "").trim(), MAX_WORK_TITLE_LEN) || null,
    truncate(String(body.source ?? "").trim(), MAX_SOURCE_LEN) || null,
    truncate(String(body.license ?? "").trim(), MAX_LICENSE_LEN) || null,
    Number(body.qualityScore ?? 0),
    id
  );

  await syncDbToBlob();
  await logAdminAction(req, user, "glyph_update", {
    targetType: "glyph",
    targetId: id,
    details: {
      char,
      author: body.author || null,
      scriptType: body.scriptType || null,
      workTitle: body.workTitle || null,
      source: body.source || null,
      license: body.license || null,
      qualityScore: Number(body.qualityScore ?? 0),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare("SELECT image_url, thumbnail_url FROM glyphs WHERE id = ?").get(id) as
    | { image_url: string; thumbnail_url: string | null }
    | undefined;
  const info = db.prepare("DELETE FROM glyphs WHERE id = ?").run(id);
  await syncDbToBlob();
  if (info.changes > 0) {
    await deleteGlyphImageByUrl(glyph?.image_url);
    await deleteGlyphImageByUrl(glyph?.thumbnail_url);
  }
  await logAdminAction(req, user, "glyph_delete", {
    targetType: "glyph",
    targetId: id,
    details: { changes: info.changes },
  });
  return NextResponse.json({ ok: true, changes: info.changes });
}

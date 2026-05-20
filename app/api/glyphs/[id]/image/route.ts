import { NextRequest, NextResponse } from "next/server";
import { getDb, type GlyphRow, syncDbToBlob } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare("SELECT * FROM glyphs WHERE id = ?").get(id) as GlyphRow | undefined;
  if (!glyph) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const hasNewImage = file instanceof File && file.size > 0 && Boolean(file.name);

  const char = onlyChinese(String(form.get("char") ?? glyph.char)).slice(0, 1);
  if (!char) {
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = String(form.get("author") ?? glyph.author ?? "").trim();
  const scriptType = String(form.get("scriptType") ?? glyph.script_type ?? "").trim();
  const workTitle = String(form.get("workTitle") ?? glyph.work_title ?? "").trim();
  const source = String(form.get("source") ?? glyph.source ?? "").trim();
  const license = String(form.get("license") ?? glyph.license ?? "").trim();
  const qualityScore = Number(form.get("qualityScore") ?? glyph.quality_score ?? 0);
  const storedImage = hasNewImage ? await storeGlyphImage({ file, char, author, scriptType, workTitle }) : null;
  if (storedImage && "error" in storedImage) {
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }
  const imageUrl = storedImage ? storedImage.imageUrl : glyph.image_url;

  db.prepare(`
    UPDATE glyphs
    SET char = ?, author = ?, script_type = ?, work_title = ?, source = ?, license = ?, quality_score = ?, image_url = ?
    WHERE id = ?
  `).run(
    char,
    author || null,
    scriptType || null,
    workTitle || null,
    source || null,
    license || null,
    Number.isFinite(qualityScore) ? qualityScore : glyph.quality_score,
    imageUrl,
    id
  );
  await syncDbToBlob();
  await logAdminAction(req, user, hasNewImage ? "glyph_image_replace" : "glyph_update", {
    targetType: "glyph",
    targetId: id,
    details: {
      previousImageUrl: glyph.image_url,
      imageUrl,
      blobName: storedImage && "blobName" in storedImage ? storedImage.blobName : null,
      storage: storedImage && "storage" in storedImage ? storedImage.storage : null,
      char,
      author: author || null,
      scriptType: scriptType || null,
      workTitle: workTitle || null,
      source: source || null,
      license: license || null,
      qualityScore: Number.isFinite(qualityScore) ? qualityScore : glyph.quality_score,
    },
  });

  return NextResponse.json({
    ok: true,
    imageUrl,
    blobName: storedImage && "blobName" in storedImage ? storedImage.blobName : null,
    storage: storedImage && "storage" in storedImage ? storedImage.storage : null,
  });
}

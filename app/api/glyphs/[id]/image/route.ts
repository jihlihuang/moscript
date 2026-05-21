import { NextRequest, NextResponse } from "next/server";
import { getDb, type GlyphRow, syncDbToBlob } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { canAccessGlyph } from "@/lib/glyph-access";
import { deleteGlyphImageByUrl, onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, { params }: Params) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();

  const { id } = await params;
  const db = await getDb();
  const glyph = db.prepare("SELECT * FROM glyphs WHERE id = ?").get(id) as GlyphRow | undefined;
  if (!glyph) {
    return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  }
  const isOwner = glyph.owner_user_id === user.id;
  const isAdmin = isAdminAllowed(user);
  if (!canAccessGlyph(glyph, user)) return NextResponse.json({ error: "找不到字圖" }, { status: 404 });
  if (!isAdmin && !isOwner) return forbidden();

  const form = await req.formData();
  const file = form.get("file");
  const thumbnailFile = form.get("thumbnailFile");
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
  const isPrivate = Boolean(glyph.owner_user_id && glyph.visibility === "private");
  const storedImage = hasNewImage ? await storeGlyphImage({ file, char, author, scriptType, workTitle, isPrivate }) : null;
  if (storedImage && "error" in storedImage) {
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }
  const storedThumbnail = hasNewImage && thumbnailFile instanceof File
    ? await storeGlyphImage({ file: thumbnailFile, char, author, scriptType, workTitle, isPrivate })
    : null;
  if (storedThumbnail && "error" in storedThumbnail) {
    return NextResponse.json({ error: storedThumbnail.error }, { status: 400 });
  }
  const imageUrl = storedImage ? storedImage.imageUrl : glyph.image_url;
  const thumbnailUrl = storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : glyph.thumbnail_url;

  db.prepare(`
    UPDATE glyphs
    SET char = ?, author = ?, script_type = ?, work_title = ?, source = ?, license = ?, quality_score = ?, image_url = ?, thumbnail_url = ?
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
    thumbnailUrl,
    id
  );
  await syncDbToBlob();
  if (storedImage && imageUrl !== glyph.image_url) {
    await deleteGlyphImageByUrl(glyph.image_url);
  }
  if (storedThumbnail && thumbnailUrl !== glyph.thumbnail_url) {
    await deleteGlyphImageByUrl(glyph.thumbnail_url);
  }
  if (isAdmin) {
    await logAdminAction(req, user, hasNewImage ? "glyph_image_replace" : "glyph_update", {
      targetType: "glyph",
      targetId: id,
      details: {
        previousImageUrl: glyph.image_url,
        imageUrl,
        thumbnailUrl,
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
  }

  return NextResponse.json({
    ok: true,
    imageUrl,
    thumbnailUrl,
    blobName: storedImage && "blobName" in storedImage ? storedImage.blobName : null,
    storage: storedImage && "storage" in storedImage ? storedImage.storage : null,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { MAX_GLYPH_IMAGE_BYTES, onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";
import { logUsageEvent } from "@/lib/usage-log";
import { MAX_AUTHOR_LEN, MAX_LICENSE_LEN, MAX_SCRIPT_TYPE_LEN, MAX_SOURCE_LEN, MAX_WORK_TITLE_LEN, truncate } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const form = await req.formData();
  const file = form.get("file");
  const thumbnailFile = form.get("thumbnailFile");

  if (!(file instanceof File)) {
    await logUsageEvent({ eventType: "upload_failed", subject: "admin", userId: user.id, details: { reason: "missing_file" } });
    return NextResponse.json({ error: "請上傳圖片檔" }, { status: 400 });
  }
  if (file.size > MAX_GLYPH_IMAGE_BYTES) {
    await logUsageEvent({ eventType: "upload_failed", subject: "admin", userId: user.id, details: { reason: "file_too_large", size: file.size } });
    return NextResponse.json({ error: "圖片檔案過大，最大允許 20MB" }, { status: 400 });
  }

  const char = onlyChinese(String(form.get("char") ?? "")).slice(0, 1);
  if (!char) {
    await logUsageEvent({ eventType: "upload_failed", subject: "admin", userId: user.id, details: { reason: "missing_char" } });
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = truncate(String(form.get("author") ?? "").trim(), MAX_AUTHOR_LEN);
  const scriptType = truncate(String(form.get("scriptType") ?? "").trim(), MAX_SCRIPT_TYPE_LEN);
  const workTitle = truncate(String(form.get("workTitle") ?? "").trim(), MAX_WORK_TITLE_LEN);
  const source = truncate(String(form.get("source") ?? "manual-upload").trim(), MAX_SOURCE_LEN);
  const license = truncate(String(form.get("license") ?? "non-commercial-research").trim(), MAX_LICENSE_LEN);
  const qualityScore = Number(form.get("qualityScore") ?? 0);
  const processingMs = Number(form.get("processingMs") ?? 0);
  const rawSetId = form.get("setId");
  const setId = rawSetId ? Number(rawSetId) : null;
  const rawSetPosition = form.get("setPosition");
  const setPosition = rawSetPosition ? Number(rawSetPosition) : null;

  const storedImage = await storeGlyphImage({ file, char, author, scriptType, workTitle });
  if ("error" in storedImage) {
    await logUsageEvent({ eventType: "upload_failed", subject: char, userId: user.id, details: { reason: storedImage.error } });
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }
  const storedThumbnail = thumbnailFile instanceof File
    ? await storeGlyphImage({ file: thumbnailFile, char, author, scriptType, workTitle })
    : null;
  if (storedThumbnail && "error" in storedThumbnail) {
    await logUsageEvent({ eventType: "upload_failed", subject: char, userId: user.id, details: { reason: storedThumbnail.error } });
    return NextResponse.json({ error: storedThumbnail.error }, { status: 400 });
  }

  const db = await getDb();
  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, thumbnail_url, source, license, quality_score, set_id, set_position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    char,
    author || null,
    scriptType || null,
    workTitle || null,
    storedImage.imageUrl,
    storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : null,
    source || "manual-upload",
    license || "non-commercial-research",
    qualityScore,
    (setId && Number.isFinite(setId)) ? setId : null,
    (setPosition && Number.isFinite(setPosition)) ? setPosition : null
  );
  await syncDbToBlob();
  void logUsageEvent({
    eventType: "upload_succeeded",
    subject: char,
    userId: user.id,
    details: { processingMs: Number.isFinite(processingMs) ? processingMs : 0 },
  });
  await logAdminAction(req, user, "glyph_upload", {
    targetType: "glyph",
    targetId: info.lastInsertRowid,
    details: {
      char,
      author,
      scriptType,
      workTitle,
      source,
      license,
      imageUrl: storedImage.imageUrl,
      thumbnailUrl: storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : null,
      storage: storedImage.storage,
    },
  });

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl: storedImage.imageUrl,
    thumbnailUrl: storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : null,
    blobName: storedImage.blobName,
    storage: storedImage.storage,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { MAX_GLYPH_IMAGE_BYTES, onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";
import { logUsageEvent } from "@/lib/usage-log";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { MAX_AUTHOR_LEN, MAX_LICENSE_LEN, MAX_SCRIPT_TYPE_LEN, MAX_SOURCE_LEN, MAX_WORK_TITLE_LEN, truncate } from "@/lib/validation";
import { getClientIp, logSecurityEvent } from "@/lib/security-log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入後再上傳字圖");

  const rl = checkRateLimit(rateLimitKey(req, "upload"), 10, 60_000);
  if (!rl.allowed) {
    void logSecurityEvent({
      eventType: "rate_limit_upload",
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
      userId: user.id,
      path: req.nextUrl.pathname,
    });
    return NextResponse.json({ error: "上傳太頻繁，請稍後再試" }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    await logUsageEvent({ eventType: "upload_failed", subject: "personal", userId: user.id, details: { reason: "missing_file" } });
    return NextResponse.json({ error: "請上傳圖片檔" }, { status: 400 });
  }
  if (file.size > MAX_GLYPH_IMAGE_BYTES) {
    await logUsageEvent({ eventType: "upload_failed", subject: "personal", userId: user.id, details: { reason: "file_too_large", size: file.size } });
    return NextResponse.json({ error: "圖片檔案過大，最大允許 20MB" }, { status: 400 });
  }
  const thumbnailFile = form.get("thumbnailFile");

  const char = onlyChinese(String(form.get("char") ?? "")).slice(0, 1);
  if (!char) {
    await logUsageEvent({ eventType: "upload_failed", subject: "personal", userId: user.id, details: { reason: "missing_char" } });
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = truncate(String(form.get("author") ?? user.name ?? "").trim(), MAX_AUTHOR_LEN);
  const scriptType = truncate(String(form.get("scriptType") ?? "").trim(), MAX_SCRIPT_TYPE_LEN);
  const workTitle = truncate(String(form.get("workTitle") ?? "").trim(), MAX_WORK_TITLE_LEN);
  const source = truncate(String(form.get("source") ?? "personal-upload").trim(), MAX_SOURCE_LEN);
  const license = truncate(String(form.get("license") ?? "user-submitted").trim(), MAX_LICENSE_LEN);
  // qualityScore is intentionally ignored for personal uploads to prevent ranking manipulation.
  // It is set server-side based on processing metadata only.
  const qualityScore = 0;
  const processingMs = Number(form.get("processingMs") ?? 0);
  const visibility = form.get("visibility") === "private" ? "private" : "public";

  const storedImage = await storeGlyphImage({ file, char, author, scriptType, workTitle, isPrivate: visibility === "private" });
  if ("error" in storedImage) {
    await logUsageEvent({ eventType: "upload_failed", subject: char, userId: user.id, details: { reason: storedImage.error } });
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }
  const storedThumbnail = thumbnailFile instanceof File
    ? await storeGlyphImage({ file: thumbnailFile, char, author, scriptType, workTitle, isPrivate: visibility === "private" })
    : null;
  if (storedThumbnail && "error" in storedThumbnail) {
    await logUsageEvent({ eventType: "upload_failed", subject: char, userId: user.id, details: { reason: storedThumbnail.error } });
    return NextResponse.json({ error: storedThumbnail.error }, { status: 400 });
  }

  const db = await getDb();
  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, thumbnail_url, source, license, quality_score,
      owner_user_id, owner_user_email, owner_user_name, visibility
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    char,
    author || user.name || null,
    scriptType || null,
    workTitle || null,
    storedImage.imageUrl,
    storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : null,
    source || "personal-upload",
    license || "user-submitted",
    Number.isFinite(qualityScore) ? qualityScore : 0,
    user.id,
    user.email,
    user.name,
    visibility
  );

  await syncDbToBlob();
  void logUsageEvent({
    eventType: "upload_succeeded",
    subject: char,
    userId: user.id,
    details: { visibility, processingMs: Number.isFinite(processingMs) ? processingMs : 0 },
  });

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl: storedImage.imageUrl,
    thumbnailUrl: storedThumbnail && "imageUrl" in storedThumbnail ? storedThumbnail.imageUrl : null,
    blobName: storedImage.blobName,
    storage: storedImage.storage,
    visibility,
  });
}

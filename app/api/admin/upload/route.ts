import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";
import { onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized();
  if (!isAdminAllowed(user)) return forbidden();

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請上傳圖片檔" }, { status: 400 });
  }

  const char = onlyChinese(String(form.get("char") ?? "")).slice(0, 1);
  if (!char) {
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = String(form.get("author") ?? "").trim();
  const scriptType = String(form.get("scriptType") ?? "").trim();
  const workTitle = String(form.get("workTitle") ?? "").trim();
  const source = String(form.get("source") ?? "manual-upload").trim();
  const license = String(form.get("license") ?? "non-commercial-research").trim();
  const qualityScore = Number(form.get("qualityScore") ?? 0);

  const storedImage = await storeGlyphImage({ file, char, author, scriptType, workTitle });
  if ("error" in storedImage) {
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }

  const db = await getDb();
  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, source, license, quality_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    char,
    author || null,
    scriptType || null,
    workTitle || null,
    storedImage.imageUrl,
    source || "manual-upload",
    license || "non-commercial-research",
    qualityScore
  );
  await syncDbToBlob();
  await logAdminAction(req, user, "glyph_upload", {
    targetType: "glyph",
    targetId: info.lastInsertRowid,
    details: { char, author, scriptType, workTitle, source, license, imageUrl: storedImage.imageUrl, storage: storedImage.storage },
  });

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl: storedImage.imageUrl,
    blobName: storedImage.blobName,
    storage: storedImage.storage,
  });
}

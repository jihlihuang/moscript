import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { onlyChinese, storeGlyphImage } from "@/lib/glyph-upload";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入後再上傳字圖");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請上傳圖片檔" }, { status: 400 });
  }

  const char = onlyChinese(String(form.get("char") ?? "")).slice(0, 1);
  if (!char) {
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = String(form.get("author") ?? user.name ?? "").trim();
  const scriptType = String(form.get("scriptType") ?? "").trim();
  const workTitle = String(form.get("workTitle") ?? "").trim();
  const source = String(form.get("source") ?? "personal-upload").trim();
  const license = String(form.get("license") ?? "user-submitted").trim();
  const qualityScore = Number(form.get("qualityScore") ?? 0);
  const visibility = form.get("visibility") === "private" ? "private" : "public";

  const storedImage = await storeGlyphImage({ file, char, author, scriptType, workTitle });
  if ("error" in storedImage) {
    return NextResponse.json({ error: storedImage.error }, { status: 400 });
  }

  const db = await getDb();
  const info = db.prepare(`
    INSERT INTO glyphs (
      char, author, script_type, work_title, image_url, source, license, quality_score,
      owner_user_id, owner_user_email, owner_user_name, visibility
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    char,
    author || user.name || null,
    scriptType || null,
    workTitle || null,
    storedImage.imageUrl,
    source || "personal-upload",
    license || "user-submitted",
    Number.isFinite(qualityScore) ? qualityScore : 0,
    user.id,
    user.email,
    user.name,
    visibility
  );

  await syncDbToBlob();

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl: storedImage.imageUrl,
    blobName: storedImage.blobName,
    storage: storedImage.storage,
    visibility,
  });
}

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getDb, syncDbToBlob } from "@/lib/db";
import { glyphBlobName, glyphImageUrl, uploadBufferToBlob } from "@/lib/blob-storage";

export const runtime = "nodejs";

function safePart(value: string) {
  return value.replace(/[\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "未命名";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "請上傳圖片檔" }, { status: 400 });
  }

  const char = String(form.get("char") ?? "").trim();
  if (!char) {
    return NextResponse.json({ error: "請填寫單字" }, { status: 400 });
  }

  const author = String(form.get("author") ?? "").trim();
  const scriptType = String(form.get("scriptType") ?? "").trim();
  const workTitle = String(form.get("workTitle") ?? "").trim();
  const source = String(form.get("source") ?? "manual-upload").trim();
  const license = String(form.get("license") ?? "non-commercial-research").trim();
  const qualityScore = Number(form.get("qualityScore") ?? 0);

  const ext = path.extname(file.name || ".png").toLowerCase() || ".png";
  if (!/[.](jpg|jpeg|png|webp|gif|svg)$/.test(ext)) {
    return NextResponse.json({ error: "只支援 jpg、png、webp、gif、svg" }, { status: 400 });
  }

  const fileName = `${safePart(author || "佚名")}_${safePart(scriptType || "未標註")}_${safePart(workTitle || "未標題")}_${Date.now()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await uploadBufferToBlob(bytes, glyphBlobName(char, fileName), file.type || undefined);

  const imageUrl = glyphImageUrl(char, fileName);
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
    imageUrl,
    source || "manual-upload",
    license || "non-commercial-research",
    qualityScore
  );
  await syncDbToBlob();

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl,
  });
}

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getDb, syncDbToBlob } from "@/lib/db";
import { glyphBlobName, glyphImageUrl, hasBlobConfig, uploadBufferToBlob } from "@/lib/blob-storage";
import { forbidden, isAdminAllowed, logAdminAction, requireRequestUser, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

const allowedImageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
  ".heic",
  ".heif",
  ".tif",
  ".tiff",
]);
const allowedImageExtensionLabel = Array.from(allowedImageExtensions)
  .map((extension) => extension.slice(1))
  .join("、");

function safePart(value: string) {
  return value.replace(/[\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "未命名";
}

function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

async function uploadGlyphBuffer(buffer: Buffer, blobName: string, contentType?: string) {
  if (hasBlobConfig()) {
    await uploadBufferToBlob(buffer, blobName, contentType);
    return "blob";
  }

  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.join(publicRoot, ...blobName.split("/"));
  const relativePath = path.relative(publicRoot, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid glyph upload path.");
  }
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, buffer);
  return "local";
}

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

  const ext = path.extname(file.name || ".png").toLowerCase() || ".png";
  if (!allowedImageExtensions.has(ext) || (file.type && !file.type.startsWith("image/"))) {
    return NextResponse.json({ error: `只支援圖檔格式：${allowedImageExtensionLabel}` }, { status: 400 });
  }

  const fileName = `${safePart(author || "佚名")}_${safePart(scriptType || "未標註")}_${safePart(workTitle || "未標題")}_${Date.now()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const blobName = glyphBlobName(char, fileName);
  const storage = await uploadGlyphBuffer(bytes, blobName, file.type || undefined);

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
  await logAdminAction(req, user, "glyph_upload", {
    targetType: "glyph",
    targetId: info.lastInsertRowid,
    details: { char, author, scriptType, workTitle, source, license, imageUrl, storage },
  });

  return NextResponse.json({
    id: info.lastInsertRowid,
    imageUrl,
    blobName,
    storage,
  });
}

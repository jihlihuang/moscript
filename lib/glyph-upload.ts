import fs from "fs/promises";
import path from "path";
import { deleteBlobIfExists, glyphBlobName, glyphBlobNameFromPath, glyphImageUrl, hasBlobConfig, uploadBufferToBlob } from "@/lib/blob-storage";

export const allowedGlyphImageExtensions = new Set([
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

export const allowedGlyphImageExtensionLabel = Array.from(allowedGlyphImageExtensions)
  .map((extension) => extension.slice(1))
  .join("、");

export function safeGlyphFilePart(value: string) {
  return value.replace(/[\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "未命名";
}

export function onlyChinese(value: string) {
  return Array.from(value).filter((char) => /\p{Script=Han}/u.test(char)).join("");
}

export async function storeGlyphImageBuffer(buffer: Buffer, blobName: string, contentType?: string) {
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

export async function storeGlyphImage({
  file,
  char,
  author,
  scriptType,
  workTitle,
}: {
  file: File;
  char: string;
  author?: string | null;
  scriptType?: string | null;
  workTitle?: string | null;
}) {
  const ext = path.extname(file.name || ".png").toLowerCase() || ".png";
  if (!allowedGlyphImageExtensions.has(ext) || (file.type && !file.type.startsWith("image/"))) {
    return { error: `只支援圖檔格式：${allowedGlyphImageExtensionLabel}` };
  }

  const fileName = `${safeGlyphFilePart(author || "佚名")}_${safeGlyphFilePart(scriptType || "未標註")}_${safeGlyphFilePart(workTitle || "未標題")}_${Date.now()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const blobName = glyphBlobName(char, fileName);
  const storage = await storeGlyphImageBuffer(bytes, blobName, file.type || undefined);

  return {
    blobName,
    fileName,
    imageUrl: glyphImageUrl(char, fileName),
    storage,
  };
}

export async function deleteGlyphImageByUrl(imageUrl?: string | null) {
  if (!imageUrl || !imageUrl.startsWith("/glyphs/")) return;
  const parts = imageUrl
    .replace(/^\/glyphs\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts.length < 2) return;

  if (hasBlobConfig()) {
    await deleteBlobIfExists(glyphBlobNameFromPath(parts));
    return;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.join(publicRoot, "glyphs", ...parts);
  const relativePath = path.relative(publicRoot, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid glyph delete path.");
  }
  await fs.rm(localPath, { force: true });
}

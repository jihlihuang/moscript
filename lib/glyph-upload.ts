import fs from "fs/promises";
import path from "path";
import { deleteBlobIfExists, glyphBlobName, glyphBlobNameFromPath, glyphImageUrl, hasBlobConfig, uploadBufferToBlob } from "@/lib/blob-storage";

export const MAX_GLYPH_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB

export const allowedGlyphImageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
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

  const isPrivate = blobName.startsWith("private-glyphs/");
  const storageRoot = isPrivate ? path.join(process.cwd(), "data") : path.join(process.cwd(), "public");
  const localPath = path.join(storageRoot, ...blobName.split("/"));
  const relativePath = path.relative(storageRoot, localPath);
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
  isPrivate = false,
}: {
  file: File;
  char: string;
  author?: string | null;
  scriptType?: string | null;
  workTitle?: string | null;
  isPrivate?: boolean;
}) {
  const ext = path.extname(file.name || ".png").toLowerCase() || ".png";
  if (
    !allowedGlyphImageExtensions.has(ext) ||
    (file.type && !file.type.startsWith("image/")) ||
    file.type === "image/svg+xml"
  ) {
    return { error: `只支援圖檔格式：${allowedGlyphImageExtensionLabel}` };
  }

  const fileName = `${safeGlyphFilePart(author || "佚名")}_${safeGlyphFilePart(scriptType || "未標註")}_${safeGlyphFilePart(workTitle || "未標題")}_${Date.now()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const blobName = glyphBlobName(char, fileName, isPrivate);
  const storage = await storeGlyphImageBuffer(bytes, blobName, file.type || undefined);

  return {
    blobName,
    fileName,
    imageUrl: glyphImageUrl(char, fileName, isPrivate),
    storage,
  };
}

export async function deleteGlyphImageByUrl(imageUrl?: string | null) {
  if (!imageUrl || (!imageUrl.startsWith("/glyphs/") && !imageUrl.startsWith("/private-glyphs/"))) return;
  const isPrivate = imageUrl.startsWith("/private-glyphs/");
  const parts = imageUrl
    .replace(/^\/(?:private-glyphs|glyphs)\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  if (parts.length < 2) return;

  if (hasBlobConfig()) {
    await deleteBlobIfExists(glyphBlobNameFromPath(parts, isPrivate));
    return;
  }

  const storageRoot = isPrivate ? path.join(process.cwd(), "data") : path.join(process.cwd(), "public");
  const localPath = path.join(storageRoot, isPrivate ? "private-glyphs" : "glyphs", ...parts);
  const relativePath = path.relative(storageRoot, localPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid glyph delete path.");
  }
  await fs.rm(localPath, { force: true });
}

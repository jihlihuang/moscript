import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getBlobClient, glyphBlobName, glyphBlobNameFromPath, glyphImageUrl, hasBlobConfig } from "@/lib/blob-storage";
import { getCurrentUser, isAdminAllowed } from "@/lib/auth";
import { getDb, type GlyphSetRow, syncDbToBlob } from "@/lib/db";
import { MAX_GLYPH_IMAGE_BYTES, safeGlyphFilePart, storeGlyphImageBuffer } from "@/lib/glyph-upload";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function contentTypeForPath(p: string) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

export async function GET(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;
  const db = await getDb();

  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set || !set.source_image_url) {
    return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
  }

  const isOwner = user && (user.id === set.owner_user_id || isAdminAllowed(user));
  const isPublicNamedSet = Boolean(set.name && set.name.trim());
  if (!isOwner && !isPublicNamedSet) return NextResponse.json({ error: "無存取權限" }, { status: 403 });

  const imageUrl = set.source_image_url;
  const parts = imageUrl
    .replace(/^\/(?:private-glyphs|glyphs)\/?/, "")
    .split("/").filter(Boolean)
    .map((p) => decodeURIComponent(p));
  if (parts.length < 1) return NextResponse.json({ error: "找不到原圖" }, { status: 404 });

  const isPrivatePath = imageUrl.startsWith("/private-glyphs/");
  let buffer: Buffer;
  try {
    if (hasBlobConfig()) {
      buffer = await getBlobClient(glyphBlobNameFromPath(parts, isPrivatePath)).downloadToBuffer();
    } else {
      const storageRoot = isPrivatePath ? path.join(process.cwd(), "data") : path.join(process.cwd(), "public");
      const localPath = path.join(storageRoot, isPrivatePath ? "private-glyphs" : "glyphs", ...parts);
      const rel = path.relative(storageRoot, localPath);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
      buffer = await fs.readFile(localPath);
    }
  } catch {
    return NextResponse.json({ error: "找不到原圖" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeForPath(imageUrl),
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user || !isAdminAllowed(user)) {
    return NextResponse.json({ error: "需要管理員權限" }, { status: 403 });
  }
  const { id } = await params;
  const db = await getDb();
  const set = db.prepare("SELECT * FROM glyph_sets WHERE id = ?").get(id) as GlyphSetRow | undefined;
  if (!set) return NextResponse.json({ error: "找不到字組" }, { status: 404 });

  const form = await req.formData();
  const sourceFile = form.get("sourceImage");
  if (!(sourceFile instanceof File) || sourceFile.size === 0) {
    return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
  }
  if (sourceFile.size > MAX_GLYPH_IMAGE_BYTES) {
    return NextResponse.json({ error: "圖片過大，最大 20MB" }, { status: 400 });
  }

  const rawBuffer = Buffer.from(await sourceFile.arrayBuffer());
  const grayBuffer = await sharp(rawBuffer).grayscale().jpeg({ quality: 82 }).toBuffer();

  const fileName = `${safeGlyphFilePart(user.id)}_${Date.now()}.jpg`;
  const blobName = glyphBlobName("_set", fileName, true);
  await storeGlyphImageBuffer(grayBuffer, blobName, "image/jpeg");
  const sourceImageUrl = glyphImageUrl("_set", fileName, true);

  db.prepare("UPDATE glyph_sets SET source_image_url = ? WHERE id = ?").run(sourceImageUrl, id);
  await syncDbToBlob();

  return NextResponse.json({ sourceImageUrl: `/api/glyph-sets/${id}/source` });
}

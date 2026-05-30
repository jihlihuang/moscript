import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { getDb, syncDbToBlob } from "@/lib/db";
import { requireRequestUser, unauthorized } from "@/lib/auth";
import { MAX_GLYPH_IMAGE_BYTES, safeGlyphFilePart, storeGlyphImageBuffer } from "@/lib/glyph-upload";
import { glyphBlobName, glyphImageUrl } from "@/lib/blob-storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = requireRequestUser(req);
  if (!user) return unauthorized("請先登入");

  const form = await req.formData();
  const sourceFile = form.get("sourceImage");
  const visibility = form.get("visibility") === "public" ? "public" : "private";
  const isPrivate = visibility !== "public";

  let sourceImageUrl: string | null = null;
  if (sourceFile instanceof File && sourceFile.size > 0) {
    if (sourceFile.size > MAX_GLYPH_IMAGE_BYTES) {
      return NextResponse.json({ error: "原圖過大，最大允許 20MB" }, { status: 400 });
    }

    // 轉為灰階 JPEG 以節省空間
    const rawBuffer = Buffer.from(await sourceFile.arrayBuffer());
    const grayBuffer = await sharp(rawBuffer)
      .grayscale()
      .jpeg({ quality: 82, mozjpeg: false })
      .toBuffer();

    const fileName = `${safeGlyphFilePart(user.id)}_${Date.now()}.jpg`;
    const blobName = glyphBlobName("_set", fileName, isPrivate);
    await storeGlyphImageBuffer(grayBuffer, blobName, "image/jpeg");
    sourceImageUrl = glyphImageUrl("_set", fileName, isPrivate);
  }

  const db = await getDb();
  const info = db.prepare(
    "INSERT INTO glyph_sets (source_image_url, owner_user_id) VALUES (?, ?)"
  ).run(sourceImageUrl, user.id);

  await syncDbToBlob();

  return NextResponse.json({
    id: Number(info.lastInsertRowid),
    sourceImageUrl,
  }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getBlobClient, glyphBlobNameFromPath, hasBlobConfig } from "@/lib/blob-storage";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ path: string[] }>;
};

export async function GET(_req: Request, { params }: Params) {
  if (!hasBlobConfig()) {
    return NextResponse.json({ error: "Azure Blob Storage is not configured." }, { status: 500 });
  }

  const { path } = await params;
  const blob = getBlobClient(glyphBlobNameFromPath(path));

  try {
    const buffer = await blob.downloadToBuffer();
    const properties = await blob.getProperties();
    const body = new Blob([new Uint8Array(buffer)]);

    return new NextResponse(body, {
      headers: {
        "Content-Type": properties.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const statusCode = typeof error === "object" && error && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;

    if (statusCode === 404) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    throw error;
  }
}

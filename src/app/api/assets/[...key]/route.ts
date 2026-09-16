import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { readSession } from "@/lib/auth";
import { LocalStorageProvider } from "@/modules/providers/storage";

export const runtime = "nodejs";

const ALLOWED_IMAGE_WIDTHS = new Set([320, 640, 960, 1600]);

function contentTypeFor(key: string) {
  const extension = key.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "avif") return "image/avif";
  return "image/jpeg";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { key } = await context.params;
  const storage = new LocalStorageProvider();
  try {
    const storageKey = key.join("/");
    const widthParam = request.nextUrl.searchParams.get("width");
    const width = widthParam ? Number(widthParam) : undefined;
    if (
      widthParam &&
      (!Number.isInteger(width) || !ALLOWED_IMAGE_WIDTHS.has(width!))
    )
      return NextResponse.json(
        { error: "Unsupported image width." },
        { status: 400 },
      );

    const cacheIdentity = `${storageKey}:${width ?? "original"}:v1`;
    const cacheHash = createHash("sha256")
      .update(cacheIdentity)
      .digest("hex");
    const etag = `"${cacheHash}"`;
    const responseHeaders = {
      "cache-control": "private, max-age=604800, immutable",
      etag,
      "x-content-type-options": "nosniff",
    };
    if (request.headers.get("if-none-match") === etag)
      return new NextResponse(null, { status: 304, headers: responseHeaders });

    let data: Buffer;
    let contentType = contentTypeFor(storageKey);
    if (width) {
      const thumbnailKey = `cache/thumbnails/${cacheHash}.jpg`;
      if (await storage.exists(thumbnailKey)) {
        data = await storage.get(thumbnailKey);
      } else {
        const original = await storage.get(storageKey);
        data = await sharp(original)
          .rotate()
          .resize({
            width,
            fit: "inside",
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
          })
          .jpeg({ quality: width <= 640 ? 72 : 82, mozjpeg: true })
          .toBuffer();
        await storage.put(thumbnailKey, data, "image/jpeg");
      }
      contentType = "image/jpeg";
    } else {
      data = await storage.get(storageKey);
    }

    return new NextResponse(new Uint8Array(data), {
      headers: {
        ...responseHeaders,
        "content-type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}

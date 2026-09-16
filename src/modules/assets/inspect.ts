import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { calculateMegapixels } from "@/lib/domain/image";

export async function inspectImage(buffer: Buffer) {
  const image = sharp(buffer, { failOn: "warning" });
  const [metadata, stats] = await Promise.all([
    image.metadata(),
    image.clone().resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer(),
  ]);
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new Error("Image dimensions or format could not be read.");
  const average = stats.reduce((sum, value) => sum + value, 0) / stats.length;
  const perceptualHash =
    [...stats]
      .map((value) => (value >= average ? "1" : "0"))
      .join("")
      .match(/.{1,4}/g)
      ?.map((bits) => Number.parseInt(bits, 2).toString(16))
      .join("") ?? "";
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    fileSize: buffer.byteLength,
    megapixels: calculateMegapixels(metadata.width, metadata.height),
    checksum: createHash("sha256").update(buffer).digest("hex"),
    perceptualHash,
    hasMetadata: Boolean(metadata.exif || metadata.iptc || metadata.xmp),
  };
}

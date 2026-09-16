import "server-only";
import sharp from "sharp";
import { inspectImage } from "@/modules/assets/inspect";
import { normalizeFilename } from "@/lib/domain/metadata";

export async function prepareAdobeJpeg(
  input: Buffer,
  filenameHint: string,
  minimumMegapixels = 4,
) {
  const source = await inspectImage(input);
  if (source.megapixels < minimumMegapixels)
    throw new Error(
      `Approved source is ${source.megapixels.toFixed(2)}MP. It must reach ${minimumMegapixels}MP before JPEG preparation.`,
    );
  const buffer = await sharp(input, { failOn: "warning" })
    .rotate()
    .toColourspace("srgb")
    .jpeg({
      quality: 94,
      chromaSubsampling: "4:4:4",
      progressive: true,
      force: true,
    })
    .toBuffer();
  const prepared = await inspectImage(buffer);
  if (prepared.format !== "jpeg" || prepared.megapixels < minimumMegapixels)
    throw new Error("Prepared JPEG failed Adobe technical validation.");
  return {
    buffer,
    filename: normalizeFilename(filenameHint),
    source,
    prepared,
  };
}

export function validatePreparedJpeg(
  input: { format: string; megapixels: number; filename: string },
  minimumMegapixels = 4,
) {
  const errors: string[] = [];
  if (input.format !== "jpeg" && input.format !== "jpg")
    errors.push("Output must be JPEG.");
  if (input.megapixels < minimumMegapixels)
    errors.push(`Output must be at least ${minimumMegapixels}MP.`);
  if (input.filename.length > 30)
    errors.push("Filename must not exceed 30 characters.");
  if (!/\.jpe?g$/i.test(input.filename))
    errors.push("Filename must use a JPEG extension.");
  return { valid: errors.length === 0, errors };
}

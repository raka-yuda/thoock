import "server-only";

import sharp from "sharp";
import { inspectImage } from "./inspect";

export type CanonicalImageRecord = {
  id: string;
  sourceAssetId?: string;
  type?: string;
  method?: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  megapixels: string | number;
  fileSize: number;
  checksum: string;
  perceptualHash: string;
};

export function selectCanonicalImage<T extends CanonicalImageRecord>(
  original: CanonicalImageRecord,
  activeDerived: T | null | undefined,
  legacyDerived?: T | null,
) {
  if (
    activeDerived?.sourceAssetId === original.id &&
    activeDerived.id !== original.id
  )
    return activeDerived;
  if (
    legacyDerived?.sourceAssetId === original.id &&
    legacyDerived.id !== original.id
  )
    return legacyDerived;
  return original;
}

export async function prepareCanonicalJpeg(input: Buffer) {
  const source = await inspectImage(input);
  const buffer = await sharp(input, { failOn: "warning" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({
      quality: 95,
      chromaSubsampling: "4:4:4",
      progressive: true,
      mozjpeg: true,
      force: true,
    })
    .toBuffer();
  const prepared = await inspectImage(buffer);
  if (prepared.format !== "jpeg")
    throw new Error("The canonical logo-removed image is not a JPEG.");
  if (
    prepared.width !== source.width ||
    prepared.height !== source.height ||
    prepared.megapixels !== source.megapixels
  )
    throw new Error(
      "Canonical image preparation changed the inspected image dimensions.",
    );
  return { buffer, source, prepared, mimeType: "image/jpeg" as const };
}

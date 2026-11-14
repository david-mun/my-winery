import sharp from "sharp";
export async function sanitizeImage(bytes: Buffer, mime: string) {
  if (
    bytes.length > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(mime)
  )
    throw new Error("IMAGE_FORMAT");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, animated: false });
  const metadata = await image.metadata();
  const formats: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  if (
    !metadata.format ||
    formats[metadata.format] !== mime ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("IMAGE_FORMAT");
  return image
    .rotate()
    .resize({
      width: 2000,
      height: 2000,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
}

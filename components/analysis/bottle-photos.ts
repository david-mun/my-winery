import type { WinePhotoAnalysis } from "@/lib/analysis/contracts";
import { encodeEditedPhoto } from "@/lib/image-client";

export type AnalyzedBottlePhoto = { file: File; analysisSource: File };

export async function bottlePhotos(
  analysis: WinePhotoAnalysis,
  files: File[],
  signal: AbortSignal,
) {
  const photos: (AnalyzedBottlePhoto | undefined)[] = Array(
    analysis.bottles.length,
  ).fill(undefined);
  for (const [sourceIndex, file] of files.entries()) {
    signal.throwIfAborted();
    const bottles = analysis.bottles
      .map((bottle, index) => ({ ...bottle, index }))
      .filter((bottle) => (bottle.source_photo ?? 1) === sourceIndex + 1);
    if (bottles.length === 1) {
      photos[bottles[0].index] = { file, analysisSource: file };
      continue;
    }
    if (!bottles.length) continue;

    const valid = bottles.filter(
      ({ bottle_box: box }) => box && box[0] < box[2] && box[1] < box[3],
    );
    if (!valid.length) continue;
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) continue;
    const canvas = document.createElement("canvas");
    try {
      const context = canvas.getContext("2d");
      if (!context) continue;
      for (const bottle of valid) {
        signal.throwIfAborted();
        const [top, left, bottom, right] = bottle.bottle_box!;
        const overlaps = valid.some(({ index, bottle_box: box }) => {
          if (index === bottle.index || !box) return false;
          return (
            Math.min(right, box[3]) > Math.max(left, box[1]) &&
            Math.min(bottom, box[2]) > Math.max(top, box[0])
          );
        });
        if (
          overlaps ||
          (top === 0 && left === 0 && bottom === 1000 && right === 1000)
        )
          continue;
        const x = Math.floor((left * bitmap.width) / 1000);
        const y = Math.floor((top * bitmap.height) / 1000);
        const width = Math.ceil((right * bitmap.width) / 1000) - x;
        const height = Math.ceil((bottom * bitmap.height) / 1000) - y;
        if (width < 4 || height < 4) continue;
        canvas.width = width;
        canvas.height = height;
        context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
        const cropped = await encodeEditedPhoto(canvas).catch(() => null);
        if (cropped)
          photos[bottle.index] = { file: cropped, analysisSource: file };
      }
    } finally {
      bitmap.close();
      canvas.width = canvas.height = 0;
    }
  }
  return photos;
}

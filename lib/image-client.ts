export async function prepareUpload(file: File): Promise<File> {
  if (
    file.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("JPEG/PNG/WebP, 10MB 이하 이미지만 선택해 주세요.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("이미지는 40메가픽셀 이하로 선택해 주세요.");
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) =>
        canvas!.toBlob(resolve, type, quality),
      );
    let type = "image/webp";
    for (;;) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      // Flatten transparency on white so JPEG fallback keeps labels readable.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.72, 0.6]) {
        let blob = await encode(type, quality);
        // Unsupported canvas encoders may silently return a large PNG.
        if (type === "image/webp" && blob?.type !== type) {
          type = "image/jpeg";
          blob = await encode(type, quality);
        }
        if (!blob || blob.type !== type)
          throw new Error(
            "사진을 변환하지 못했습니다. 다른 사진을 선택해 주세요.",
          );
        if (blob.size <= 4_000_000)
          return new File(
            [blob],
            type === "image/webp" ? "upload.webp" : "upload.jpg",
            {
              type: blob.type,
            },
          );
      }
      if (Math.max(canvas.width, canvas.height) <= 640) break;
      scale *= 0.8;
    }
    throw new Error("사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요.");
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

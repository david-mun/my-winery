export async function prepareUpload(file: File): Promise<File> {
  if (
    file.size > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("JPEG/PNG/WebP, 10MB 이하 이미지만 선택해 주세요.");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("이미지는 40메가픽셀 이하로 선택해 주세요.");
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 처리할 수 없습니다.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
        "image/webp",
        0.85,
      ),
    );
    if (blob.size > 4_000_000)
      throw new Error(
        "압축 후에도 사진이 큽니다. 해상도를 줄여 다시 선택해 주세요.",
      );
    return new File([blob], "upload.webp", { type: blob.type });
  } finally {
    bitmap.close();
  }
}

import { afterEach, expect, it, vi } from "vitest";
import { prepareUpload } from "../lib/image-client";

function setup(
  encode: (type: string, quality: number, width: number) => Blob | null,
) {
  const bitmap = { width: 4032, height: 3024, close: vi.fn() };
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: vi.fn((cb: BlobCallback, type: string, quality: number) =>
      cb(encode(type, quality, canvas.width)),
    ),
  };
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  vi.stubGlobal("document", { createElement: () => canvas });
  return { bitmap, canvas, context };
}
const input = () =>
  new File(["camera-photo"], "camera.jpg", { type: "image/jpeg" });
afterEach(() => vi.unstubAllGlobals());

it("falls back to JPEG when WebP encoding silently returns an oversized PNG", async () => {
  const { bitmap } = setup(
    (type) =>
      new Blob([new Uint8Array(type === "image/webp" ? 4_100_000 : 250_000)], {
        type: type === "image/webp" ? "image/png" : type,
      }),
  );
  const result = await prepareUpload(input());
  expect([result.type, result.name, result.size]).toEqual([
    "image/jpeg",
    "upload.jpg",
    250_000,
  ]);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it("reduces quality for a detailed photo that is still too large", async () => {
  const { context } = setup(
    (type, quality) =>
      new Blob([new Uint8Array(quality > 0.75 ? 4_100_000 : 900_000)], {
        type,
      }),
  );
  expect((await prepareUpload(input())).size).toBe(900_000);
  expect(context.drawImage).toHaveBeenCalledWith(
    expect.anything(),
    0,
    0,
    2000,
    1500,
  );
});

it("reduces dimensions if lowering quality alone is insufficient", async () => {
  setup(
    (type, _quality, width) =>
      new Blob([new Uint8Array(width > 1600 ? 4_100_000 : 800_000)], { type }),
  );
  const result = await prepareUpload(input());
  expect([result.size, result.type, result.name]).toEqual([
    800_000,
    "image/webp",
    "upload.webp",
  ]);
});

it("releases image resources and stops if an encoder cannot produce a bounded file", async () => {
  const { bitmap, canvas } = setup(
    (type) => new Blob([new Uint8Array(4_100_000)], { type }),
  );
  await expect(prepareUpload(input())).rejects.toThrow(
    "사진을 처리하지 못했습니다",
  );
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(canvas.width).toBe(0);
  expect(canvas.toBlob.mock.calls.length).toBeLessThan(30);
});

it("falls back to JPEG when WebP encoding fails without a blob", async () => {
  setup((type) =>
    type === "image/webp" ? null : new Blob(["jpeg"], { type }),
  );
  expect((await prepareUpload(input())).type).toBe("image/jpeg");
});

it("keeps the original file size and pixel limits before processing", async () => {
  const { bitmap } = setup((type) => new Blob(["image"], { type }));
  await expect(
    prepareUpload(
      new File([new Uint8Array(11 * 1024 * 1024)], "large.jpg", {
        type: "image/jpeg",
      }),
    ),
  ).rejects.toThrow("10MB");
  bitmap.width = 10000;
  bitmap.height = 10000;
  await expect(prepareUpload(input())).rejects.toThrow("40메가픽셀");
  expect(bitmap.close).toHaveBeenCalledOnce();
});

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ImageTooLargeError,
  ORIGINAL_MAX_SIDE,
  processProductImage,
  THUMBNAIL_MAX_SIDE,
  UnsupportedImageTypeError,
} from "./pipeline.js";

async function makeSquarePng(side: number): Promise<Buffer> {
  return sharp({
    create: {
      width: side,
      height: side,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

describe("processProductImage", () => {
  it("отклоняет неподдерживаемый MIME-тип", async () => {
    const buffer = await makeSquarePng(100);
    await expect(
      processProductImage(buffer, "application/pdf"),
    ).rejects.toBeInstanceOf(UnsupportedImageTypeError);
  });

  it("отклоняет изображение с исходным разрешением сверх лимита пикселей (decompression bomb)", async () => {
    // 8000x8000 = 64 млн пикселей, выше лимита в 50 млн.
    const buffer = await makeSquarePng(8000);
    await expect(processProductImage(buffer, "image/png")).rejects.toBeInstanceOf(
      ImageTooLargeError,
    );
  });

  it("ресайзит оригинал и thumbnail, конвертирует в webp", async () => {
    const buffer = await makeSquarePng(2000);
    const result = await processProductImage(buffer, "image/png");

    const originalMeta = await sharp(result.original).metadata();
    expect(originalMeta.format).toBe("webp");
    expect(Math.max(originalMeta.width!, originalMeta.height!)).toBe(
      ORIGINAL_MAX_SIDE,
    );

    const thumbMeta = await sharp(result.thumbnail).metadata();
    expect(thumbMeta.format).toBe("webp");
    expect(Math.max(thumbMeta.width!, thumbMeta.height!)).toBe(
      THUMBNAIL_MAX_SIDE,
    );
  });

  it("не увеличивает изображение меньше целевого размера", async () => {
    const buffer = await makeSquarePng(200);
    const result = await processProductImage(buffer, "image/webp");

    const originalMeta = await sharp(result.original).metadata();
    expect(originalMeta.width).toBe(200);
    expect(originalMeta.height).toBe(200);
  });
});

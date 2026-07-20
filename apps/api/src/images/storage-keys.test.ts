import { describe, expect, it } from "vitest";
import { originalImageKey, thumbnailKeyFor } from "./storage-keys.js";

describe("originalImageKey", () => {
  it("кладёт ключ под products/{sellerId}/{productId}/", () => {
    const key = originalImageKey(1, 42);
    expect(key).toMatch(/^products\/1\/42\/[0-9a-f-]+\.webp$/);
  });

  it("генерирует разные ключи на каждый вызов", () => {
    expect(originalImageKey(1, 1)).not.toBe(originalImageKey(1, 1));
  });
});

describe("thumbnailKeyFor", () => {
  it("вставляет суффикс -thumb перед расширением", () => {
    expect(thumbnailKeyFor("products/1/2/abc.webp")).toBe(
      "products/1/2/abc-thumb.webp",
    );
  });
});

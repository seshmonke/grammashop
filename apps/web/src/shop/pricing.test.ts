import { describe, expect, it } from "vitest";
import type { ShopProduct, ShopVariant } from "@grammashop/shared";
import { isProductSoldOut, minPriceKopecks, priceVaries } from "./pricing";

const variant = (over: Partial<ShopVariant>): ShopVariant => ({
  id: 1,
  name: "V",
  priceKopecks: 10000,
  oldPriceKopecks: null,
  stock: null,
  ...over,
});

const product = (variants: ShopVariant[]): ShopProduct => ({
  id: 1,
  name: "P",
  description: null,
  variants,
});

describe("minPriceKopecks", () => {
  it("минимум по вариантам", () => {
    expect(
      minPriceKopecks([variant({ priceKopecks: 30000 }), variant({ priceKopecks: 10000 })]),
    ).toBe(10000);
  });
  it("null для пустого списка", () => {
    expect(minPriceKopecks([])).toBeNull();
  });
});

describe("priceVaries", () => {
  it("true — цены вариантов различаются", () => {
    expect(priceVaries([variant({ priceKopecks: 100 }), variant({ priceKopecks: 200 })])).toBe(true);
  });
  it("false — все варианты одной цены", () => {
    expect(priceVaries([variant({ priceKopecks: 100 }), variant({ priceKopecks: 100 })])).toBe(false);
  });
});

describe("isProductSoldOut", () => {
  it("true — все варианты stock 0", () => {
    expect(isProductSoldOut(product([variant({ stock: 0 }), variant({ stock: 0 })]))).toBe(true);
  });
  it("false — есть вариант с остатком или без учёта (null)", () => {
    expect(isProductSoldOut(product([variant({ stock: 0 }), variant({ stock: null })]))).toBe(false);
  });
  it("false — нет вариантов (нечего распродавать)", () => {
    expect(isProductSoldOut(product([]))).toBe(false);
  });
});

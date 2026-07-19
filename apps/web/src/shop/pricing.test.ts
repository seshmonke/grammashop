import { describe, expect, it } from "vitest";
import type { ShopProduct, ShopVariant } from "@grammashop/shared";
import {
  discountPercent,
  hasDiscount,
  isProductSoldOut,
  minPriceKopecks,
  priceVaries,
} from "./pricing";

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

describe("hasDiscount", () => {
  it("false — старая цена не указана", () => {
    expect(hasDiscount(variant({ oldPriceKopecks: null }))).toBe(false);
  });
  it("false — старая цена равна текущей (не настоящая скидка)", () => {
    expect(
      hasDiscount(variant({ priceKopecks: 2000, oldPriceKopecks: 2000 })),
    ).toBe(false);
  });
  it("false — старая цена ниже текущей (не скидка, а рост цены)", () => {
    expect(
      hasDiscount(variant({ priceKopecks: 2000, oldPriceKopecks: 1000 })),
    ).toBe(false);
  });
  it("true — старая цена выше текущей", () => {
    expect(
      hasDiscount(variant({ priceKopecks: 1200, oldPriceKopecks: 2000 })),
    ).toBe(true);
  });
});

describe("discountPercent", () => {
  it("округляет процент скидки", () => {
    expect(
      discountPercent(variant({ priceKopecks: 1200, oldPriceKopecks: 2000 })),
    ).toBe(40);
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

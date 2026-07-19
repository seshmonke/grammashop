import { describe, expect, it } from "vitest";
import { diffVariants, type VariantFormRow } from "./variant-diff";
import type { SellerProductVariant } from "@grammashop/shared";

// Форма редактирования держит все варианты карточки в одном списке (новые
// — без id, существующие — с id); при сабмите нужно превратить это в набор
// вызовов add/update/delete (см. STACK.md#роутинг, отдельных эндпоинтов на
// "весь список" нет — только по одному варианту).

function variant(
  overrides: Partial<SellerProductVariant> = {},
): SellerProductVariant {
  return {
    id: 1,
    name: "Вариант",
    priceKopecks: 1000,
    oldPriceKopecks: null,
    stock: null,
    ...overrides,
  };
}

describe("diffVariants", () => {
  it("новая строка без id → toCreate", () => {
    const row: VariantFormRow = {
      name: "Новый",
      priceKopecks: 2000,
      oldPriceKopecks: null,
      stock: null,
    };
    const result = diffVariants([], [row]);
    expect(result.toCreate).toEqual([row]);
    expect(result.toUpdate).toEqual([]);
    expect(result.toDelete).toEqual([]);
  });

  it("отсутствующий в форме id → toDelete", () => {
    const original = [variant({ id: 5 })];
    const result = diffVariants(original, []);
    expect(result.toDelete).toEqual([5]);
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([]);
  });

  it("изменённое поле у существующего id → toUpdate", () => {
    const original = [variant({ id: 5, priceKopecks: 1000 })];
    const row: VariantFormRow = variant({ id: 5, priceKopecks: 1500 });
    const result = diffVariants(original, [row]);
    expect(result.toUpdate).toEqual([
      { variantId: 5, input: { priceKopecks: 1500 } },
    ]);
  });

  it("неизменённая строка с id → ничего", () => {
    const original = [variant({ id: 5 })];
    const row: VariantFormRow = { ...variant({ id: 5 }) };
    const result = diffVariants(original, [row]);
    expect(result.toCreate).toEqual([]);
    expect(result.toUpdate).toEqual([]);
    expect(result.toDelete).toEqual([]);
  });

  it("меняются только затронутые поля, не весь объект", () => {
    const original = [
      variant({ id: 5, name: "Старое", priceKopecks: 1000, stock: 3 }),
    ];
    const row: VariantFormRow = {
      id: 5,
      name: "Старое",
      priceKopecks: 1000,
      oldPriceKopecks: null,
      stock: 7,
    };
    const result = diffVariants(original, [row]);
    expect(result.toUpdate).toEqual([{ variantId: 5, input: { stock: 7 } }]);
  });
});

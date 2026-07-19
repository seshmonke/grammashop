import { describe, expect, it } from "vitest";
import {
  cartCount,
  cartReducer,
  cartTotalKopecks,
  initialCartState,
  type CartItem,
} from "./cart-reducer";

const item = (over: Partial<Omit<CartItem, "quantity">> = {}): Omit<CartItem, "quantity"> => ({
  sellerId: 1,
  productId: 10,
  variantId: 100,
  productName: "Худи",
  variantName: "M",
  priceKopecks: 300000,
  stock: null,
  ...over,
});

describe("cartReducer / add", () => {
  it("добавляет новую позицию с количеством 1 по умолчанию", () => {
    const state = cartReducer(initialCartState, { type: "add", item: item() });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]!.quantity).toBe(1);
    expect(state.sellerId).toBe(1);
  });

  it("повторное добавление того же варианта суммирует количество", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item() });
    state = cartReducer(state, { type: "add", item: item(), quantity: 2 });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]!.quantity).toBe(3);
  });

  it("количество не превышает остаток на варианте", () => {
    const state = cartReducer(initialCartState, {
      type: "add",
      item: item({ stock: 2 }),
      quantity: 5,
    });
    expect(state.items[0]!.quantity).toBe(2);
  });

  it("добавление товара другого продавца сбрасывает корзину (заказ — одному продавцу)", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item({ sellerId: 1 }) });
    state = cartReducer(state, { type: "add", item: item({ sellerId: 2, variantId: 200 }) });
    expect(state.sellerId).toBe(2);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]!.variantId).toBe(200);
  });
});

describe("cartReducer / remove", () => {
  it("удаляет позицию по variantId", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item() });
    state = cartReducer(state, { type: "remove", variantId: 100 });
    expect(state.items).toHaveLength(0);
  });
});

describe("cartReducer / setQuantity", () => {
  it("меняет количество позиции", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item() });
    state = cartReducer(state, { type: "setQuantity", variantId: 100, quantity: 4 });
    expect(state.items[0]!.quantity).toBe(4);
  });

  it("ограничивает количество остатком", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item({ stock: 3 }) });
    state = cartReducer(state, { type: "setQuantity", variantId: 100, quantity: 10 });
    expect(state.items[0]!.quantity).toBe(3);
  });

  it("количество 0 или меньше удаляет позицию", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item() });
    state = cartReducer(state, { type: "setQuantity", variantId: 100, quantity: 0 });
    expect(state.items).toHaveLength(0);
  });
});

describe("cartReducer / clear", () => {
  it("очищает корзину целиком", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item() });
    state = cartReducer(state, { type: "clear" });
    expect(state).toEqual(initialCartState);
  });
});

describe("cartCount / cartTotalKopecks", () => {
  it("считает суммарное количество и стоимость позиций", () => {
    let state = cartReducer(initialCartState, { type: "add", item: item(), quantity: 2 });
    state = cartReducer(state, {
      type: "add",
      item: item({ variantId: 101, priceKopecks: 50000 }),
      quantity: 1,
    });
    expect(cartCount(state)).toBe(3);
    expect(cartTotalKopecks(state)).toBe(650000);
  });

  it("пустая корзина — 0", () => {
    expect(cartCount(initialCartState)).toBe(0);
    expect(cartTotalKopecks(initialCartState)).toBe(0);
  });
});

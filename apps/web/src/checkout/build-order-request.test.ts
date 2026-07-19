import { describe, expect, it } from "vitest";
import type { CartItem } from "../cart/cart-reducer";
import { buildCreateOrderRequest, type CheckoutFormValues } from "./build-order-request";

const items: CartItem[] = [
  {
    sellerId: 1,
    productId: 10,
    variantId: 100,
    productName: "Худи",
    variantName: "M",
    priceKopecks: 300000,
    stock: null,
    quantity: 2,
  },
];

const form: CheckoutFormValues = {
  buyerFullName: "  Иван Иванов  ",
  buyerPhone: " +79990001122 ",
  buyerAddress: " Москва, ул. Примерная, 1 ",
  buyerComment: "  ",
  consent: true,
};

describe("buildCreateOrderRequest", () => {
  it("собирает позиции из корзины (variantId + quantity)", () => {
    const req = buildCreateOrderRequest(items, form);
    expect(req.items).toEqual([{ variantId: 100, quantity: 2 }]);
  });

  it("подрезает пробелы в полях покупателя", () => {
    const req = buildCreateOrderRequest(items, form);
    expect(req.buyerFullName).toBe("Иван Иванов");
    expect(req.buyerPhone).toBe("+79990001122");
    expect(req.buyerAddress).toBe("Москва, ул. Примерная, 1");
  });

  it("пустой комментарий (только пробелы) превращается в null", () => {
    const req = buildCreateOrderRequest(items, form);
    expect(req.buyerComment).toBeNull();
  });

  it("непустой комментарий подрезается и остаётся", () => {
    const req = buildCreateOrderRequest(items, { ...form, buyerComment: " Позвоните " });
    expect(req.buyerComment).toBe("Позвоните");
  });

  it("consent передаётся как есть", () => {
    const req = buildCreateOrderRequest(items, form);
    expect(req.consent).toBe(true);
  });
});

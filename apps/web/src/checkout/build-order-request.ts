import type { CreateOrderRequest } from "@grammashop/shared";
import type { CartItem } from "../cart/cart-reducer";

// Форма чекаута → тело POST /shop/:sellerId/orders (см.
// CONCEPT.md#каталог-и-заказы). Позиции идут из корзины, не из формы —
// форма несёт только то, что платформа не знает сама (см. комментарий в
// packages/shared/src/schemas/orders.ts).
export type CheckoutFormValues = {
  buyerFullName: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerComment: string;
  consent: boolean;
};

// Согласие на обработку ПДн (152-ФЗ) — обязательное условие отправки, не
// просто UX-подсказка: без него функция бросает, а не тихо шлёт `consent:
// false` мимо схемы. Компонент держит кнопку отправки задизейбленной, пока
// чекбокс не отмечен, — сюда попадают только уже провалидированные данные.
export function buildCreateOrderRequest(
  items: CartItem[],
  form: CheckoutFormValues,
): CreateOrderRequest {
  if (!form.consent) {
    throw new Error("Согласие на обработку ПДн обязательно");
  }
  const comment = form.buyerComment.trim();
  return {
    items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    buyerFullName: form.buyerFullName.trim(),
    buyerPhone: form.buyerPhone.trim(),
    buyerAddress: form.buyerAddress.trim(),
    buyerComment: comment === "" ? null : comment,
    consent: true,
  };
}

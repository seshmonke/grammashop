import { checkoutFormSchema } from "@grammashop/shared";
import type { CheckoutFormValues } from "./build-order-request";

// Валидация формы чекаута той же Zod-схемой, что и бэк (см.
// STACK.md#валидация: валидация не дублируется) — checkoutFormSchema
// вынесена в packages/shared/src/schemas/orders.ts именно ради этого
// переиспользования.

export type CheckoutFormErrors = Partial<Record<keyof CheckoutFormValues, string>>;

// Для пустого поля — понятное «Укажите …» вместо технического сообщения
// Zod про минимальную длину. Для непустого, но неверного значения (сейчас
// это только телефон не в формате +7XXXXXXXXXX) — используется сообщение
// самой схемы (checkoutFormSchema, packages/shared): оно уже конкретное.
const EMPTY_FIELD_MESSAGES: Record<string, string> = {
  buyerFullName: "Укажите ФИО",
  buyerPhone: "Укажите телефон",
  buyerAddress: "Укажите адрес доставки",
  consent: "Отметьте согласие на обработку персональных данных",
};

export function validateCheckoutForm(form: CheckoutFormValues): CheckoutFormErrors {
  const comment = form.buyerComment.trim();
  const result = checkoutFormSchema.safeParse({
    buyerFullName: form.buyerFullName,
    buyerPhone: form.buyerPhone,
    buyerAddress: form.buyerAddress,
    buyerComment: comment === "" ? null : comment,
    consent: form.consent,
  });
  if (result.success) return {};

  const errors: CheckoutFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof CheckoutFormValues | undefined;
    if (!field || errors[field]) continue;
    // consent — булево «пустое» значение — false, а не строка; для него
    // технического сообщения схемы («Invalid literal value…») никогда нет
    // смысла показывать, дружелюбный текст всегда в приоритете.
    const isEmpty =
      field === "consent" ? true : form[field].toString().trim() === "";
    errors[field] = isEmpty ? EMPTY_FIELD_MESSAGES[field] : issue.message;
  }
  return errors;
}

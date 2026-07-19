import { checkoutFormSchema } from "@grammashop/shared";
import type { CheckoutFormValues } from "./build-order-request";

// Валидация формы чекаута той же Zod-схемой, что и бэк (см.
// STACK.md#валидация: валидация не дублируется) — checkoutFormSchema
// вынесена в packages/shared/src/schemas/orders.ts именно ради этого
// переиспользования.

export type CheckoutFormErrors = Partial<Record<keyof CheckoutFormValues, string>>;

const FIELD_MESSAGES: Record<string, string> = {
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
    if (field && !errors[field]) {
      errors[field] = FIELD_MESSAGES[field] ?? issue.message;
    }
  }
  return errors;
}

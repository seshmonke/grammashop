import { registerSellerRequestSchema } from "@grammashop/shared";

// Валидация формы регистрации магазина той же Zod-схемой, что и бэк (см.
// STACK.md#валидация), по образцу checkout/validate-checkout-form.ts.

export type RegisterFormValues = {
  shopName: string;
  fullName: string;
  phone: string;
  consent: boolean;
};

export type RegisterFormErrors = Partial<Record<keyof RegisterFormValues, string>>;

const EMPTY_FIELD_MESSAGES: Record<string, string> = {
  shopName: "Укажите название магазина",
  fullName: "Укажите ФИО",
  phone: "Укажите телефон",
  consent: "Отметьте согласие на обработку персональных данных",
};

export function validateRegisterForm(form: RegisterFormValues): RegisterFormErrors {
  const result = registerSellerRequestSchema.safeParse({
    shopName: form.shopName,
    fullName: form.fullName,
    phone: form.phone,
    consent: form.consent,
  });
  if (result.success) return {};

  const errors: RegisterFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof RegisterFormValues | undefined;
    if (!field || errors[field]) continue;
    const isEmpty =
      field === "consent" ? true : form[field].toString().trim() === "";
    errors[field] = isEmpty ? EMPTY_FIELD_MESSAGES[field] : issue.message;
  }
  return errors;
}

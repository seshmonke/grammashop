import { describe, expect, it } from "vitest";
import type { CheckoutFormValues } from "./build-order-request";
import { validateCheckoutForm } from "./validate-checkout-form";

const validForm: CheckoutFormValues = {
  buyerFullName: "Иван Иванов",
  buyerPhone: "+79990001122",
  buyerAddress: "Москва, ул. Примерная, 1",
  buyerComment: "",
  consent: true,
};

describe("validateCheckoutForm", () => {
  it("валидная форма — ошибок нет", () => {
    expect(validateCheckoutForm(validForm)).toEqual({});
  });

  it("пустое ФИО — ошибка на поле buyerFullName", () => {
    const errors = validateCheckoutForm({ ...validForm, buyerFullName: "  " });
    expect(errors.buyerFullName).toBeDefined();
  });

  it("пустой телефон — ошибка на поле buyerPhone", () => {
    const errors = validateCheckoutForm({ ...validForm, buyerPhone: "" });
    expect(errors.buyerPhone).toBeDefined();
  });

  it("пустой адрес — ошибка на поле buyerAddress", () => {
    const errors = validateCheckoutForm({ ...validForm, buyerAddress: "   " });
    expect(errors.buyerAddress).toBeDefined();
  });

  it("не отмечено согласие — ошибка на поле consent", () => {
    const errors = validateCheckoutForm({ ...validForm, consent: false });
    expect(errors.consent).toBeDefined();
  });

  it("несколько невалидных полей — ошибки по каждому", () => {
    const errors = validateCheckoutForm({
      buyerFullName: "",
      buyerPhone: "",
      buyerAddress: "",
      buyerComment: "",
      consent: false,
    });
    expect(Object.keys(errors).sort()).toEqual(
      ["buyerAddress", "buyerFullName", "buyerPhone", "consent"].sort(),
    );
  });

  it("пустой комментарий не считается ошибкой", () => {
    expect(validateCheckoutForm({ ...validForm, buyerComment: "   " })).toEqual({});
  });
});

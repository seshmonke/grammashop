import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { INSUFFICIENT_STOCK_ERROR } from "@grammashop/shared";
import { checkoutErrorMessage } from "./checkout-error-message";

function axiosErrorWithResponse(status: number, data: unknown): AxiosError {
  const error = new AxiosError("Request failed");
  error.response = { status, data } as AxiosError["response"];
  return error;
}

function axiosErrorWithoutResponse(): AxiosError {
  return new AxiosError("Network Error");
}

describe("checkoutErrorMessage", () => {
  it("нет response (сетевая ошибка/оффлайн) — сообщение про подключение", () => {
    expect(checkoutErrorMessage(axiosErrorWithoutResponse())).toBe(
      "Не удалось связаться с сервером — проверьте подключение и попробуйте ещё раз.",
    );
  });

  it("400 с недостатком остатка — сообщение про склад", () => {
    const error = axiosErrorWithResponse(400, { error: INSUFFICIENT_STOCK_ERROR });
    expect(checkoutErrorMessage(error)).toBe(
      "Одного из товаров уже не хватает на складе — обновите корзину и попробуйте снова.",
    );
  });

  it("другая ошибка API (например, 404) — общее сообщение", () => {
    const error = axiosErrorWithResponse(404, { error: "магазин или товар не найден" });
    expect(checkoutErrorMessage(error)).toBe("Не удалось оформить заказ — попробуйте ещё раз.");
  });

  it("не axios-ошибка — общее сообщение", () => {
    expect(checkoutErrorMessage(new Error("boom"))).toBe(
      "Не удалось оформить заказ — попробуйте ещё раз.",
    );
  });
});

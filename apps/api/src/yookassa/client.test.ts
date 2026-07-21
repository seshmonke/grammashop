import { afterEach, describe, expect, it, vi } from "vitest";
import { createPayment, getPayment, kopecksToAmountValue } from "./client.js";

describe("kopecksToAmountValue", () => {
  it("форматирует копейки в строку с двумя знаками", () => {
    expect(kopecksToAmountValue(100)).toBe("1.00");
    expect(kopecksToAmountValue(39900)).toBe("399.00");
    expect(kopecksToAmountValue(1)).toBe("0.01");
  });
});

describe("createPayment / getPayment (контракт запроса)", () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...OLD_ENV };
  });

  function stubFetchOk(payload: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("шлёт Basic auth, Idempotence-Key и save_payment_method при привязке", async () => {
    process.env.YOOKASSA_SHOP_ID = "shop_1";
    process.env.YOOKASSA_SECRET_KEY = "secret_1";
    process.env.YOOKASSA_API_URL = "https://api.example/v3";
    const fetchMock = stubFetchOk({ id: "p1", status: "pending", paid: false, amount: {} });

    await createPayment(
      { amountKopecks: 100, description: "тест", savePaymentMethod: true, returnUrl: "https://ret" },
      "idem-123",
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.example/v3/payments");
    expect(init.method).toBe("POST");
    expect(init.headers["Idempotence-Key"]).toBe("idem-123");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("shop_1:secret_1").toString("base64")}`,
    );
    const body = JSON.parse(init.body);
    expect(body.save_payment_method).toBe(true);
    expect(body.capture).toBe(true);
    expect(body.amount).toEqual({ value: "1.00", currency: "RUB" });
    expect(body.confirmation).toEqual({ type: "redirect", return_url: "https://ret" });
  });

  it("рекуррент шлёт payment_method_id и не шлёт save_payment_method", async () => {
    process.env.YOOKASSA_SHOP_ID = "shop_1";
    process.env.YOOKASSA_SECRET_KEY = "secret_1";
    process.env.YOOKASSA_API_URL = "https://api.example/v3";
    const fetchMock = stubFetchOk({ id: "p2", status: "succeeded", paid: true, amount: {} });

    await createPayment(
      { amountKopecks: 100, description: "продление", paymentMethodId: "pm_1" },
      "idem-456",
    );

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.payment_method_id).toBe("pm_1");
    expect(body.save_payment_method).toBeUndefined();
    expect(body.confirmation).toBeUndefined();
  });

  it("бросает при не-2xx без утечки тела", async () => {
    process.env.YOOKASSA_SHOP_ID = "shop_1";
    process.env.YOOKASSA_SECRET_KEY = "secret_1";
    process.env.YOOKASSA_API_URL = "https://api.example/v3";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );

    await expect(getPayment("p3")).rejects.toThrow(/HTTP 401/);
  });
});

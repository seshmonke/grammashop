// Тонкий клиент к ЮKassa API v3 на fetch, без SDK (см. Спринт 26,
// «Анализ перед стартом»): в денежном пути single-maintainer зависимость
// ради двух вызовов — supply-chain риск. Basic auth ShopID:SecretKey +
// заголовок Idempotence-Key (идемпотентность POST держится 24ч, см.
// https://yookassa.ru/developers/using-api/idempotence).
//
// Sandbox — тот же хост api.yookassa.ru/v3, отличается только тестовыми
// ShopID/ключом (рекуррент включён в тестовом магазине по умолчанию).
// YOOKASSA_API_URL переопределяется в тестах, чтобы не ходить в сеть.

const DEFAULT_API_URL = "https://api.yookassa.ru/v3";

export type YooKassaAmount = { value: string; currency: "RUB" };

// Урезано до полей, которые реально читаем. status: pending →
// succeeded | canceled | waiting_for_capture (последний не используем —
// платежи создаём с capture:true, одностадийно).
export type YooKassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: YooKassaAmount;
  // Присутствует после привязки карты; .id — токен для рекуррента, .saved
  // == true, если метод сохранён для повторных списаний.
  payment_method?: { id: string; saved: boolean; type?: string };
  // Только у первого платежа (создан с confirmation) — URL, который
  // продавец открывает для подтверждения привязки карты.
  confirmation?: { type: string; confirmation_url?: string };
};

type CreatePaymentParams = {
  amountKopecks: number;
  description: string;
  // Первый платёж (привязка карты): просим сохранить метод и даём
  // confirmation с возвратным URL.
  savePaymentMethod?: boolean;
  returnUrl?: string;
  // Рекуррентное списание: платёж по сохранённому токену, без подтверждения.
  paymentMethodId?: string;
};

function config(): { shopId: string; secretKey: string; apiUrl: string } {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    throw new Error(
      "YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY не заданы — см. .env.example",
    );
  }
  return {
    shopId,
    secretKey,
    apiUrl: process.env.YOOKASSA_API_URL || DEFAULT_API_URL,
  };
}

// Копейки → строка "X.XX" (ЮKassa принимает value только строкой с двумя
// знаками). 100 → "1.00".
export function kopecksToAmountValue(kopecks: number): string {
  return (kopecks / 100).toFixed(2);
}

function authHeader(shopId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`;
}

async function request<T>(
  method: "GET" | "POST",
  pathname: string,
  opts: { idempotenceKey?: string; body?: unknown } = {},
): Promise<T> {
  const { shopId, secretKey, apiUrl } = config();
  const headers: Record<string, string> = {
    Authorization: authHeader(shopId, secretKey),
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.idempotenceKey) {
    headers["Idempotence-Key"] = opts.idempotenceKey;
  }
  const res = await fetch(`${apiUrl}${pathname}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    // Тело ошибки ЮKassa не содержит ПДн (код/описание платежа), но и не
    // тащим его целиком в исключение — только статус и id-путь.
    throw new Error(`ЮKassa ${method} ${pathname} → HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// POST /payments. idempotenceKey обязателен — при ретрае того же
// логического платежа ЮKassa вернёт исходный, а не создаст второй.
export async function createPayment(
  params: CreatePaymentParams,
  idempotenceKey: string,
): Promise<YooKassaPayment> {
  const body: Record<string, unknown> = {
    amount: {
      value: kopecksToAmountValue(params.amountKopecks),
      currency: "RUB",
    },
    capture: true,
    description: params.description,
  };
  if (params.paymentMethodId) {
    body.payment_method_id = params.paymentMethodId;
  }
  if (params.savePaymentMethod) {
    body.save_payment_method = true;
  }
  if (params.returnUrl) {
    body.confirmation = { type: "redirect", return_url: params.returnUrl };
  }
  return request<YooKassaPayment>("POST", "/payments", {
    idempotenceKey,
    body,
  });
}

// GET /payments/{id} — перечитка статуса. Вебхук ЮKassa не подписан, телу
// доверять нельзя: продлеваем подписку только по статусу, полученному
// этим вызовом (см. Спринт 26, «Анализ перед стартом»).
export async function getPayment(id: string): Promise<YooKassaPayment> {
  return request<YooKassaPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authResponseSchema } from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { sellers } from "../db/schema.js";
import { inArray } from "drizzle-orm";

// Тестовые telegram_id — свои на каждый кейс, чтобы тесты не зависели
// друг от друга; чистятся перед каждым тестом.
const BUYER_ID = 700100001;
const SELLER_ID_TG = 700100002;
const BLOCKED_ID_TG = 700100003;
const ADMIN_ID_TG = 700100004;
const DELETED_ID_TG = 700100005;
const ALL_TEST_IDS = [
  BUYER_ID,
  SELLER_ID_TG,
  BLOCKED_ID_TG,
  ADMIN_ID_TG,
  DELETED_ID_TG,
];

const TEST_BOT_TOKEN = "123456:TEST-token-auth-route";

function signInitData(
  telegramId: number,
  token = TEST_BOT_TOKEN,
  authDate = Math.floor(Date.now() / 1000),
  username?: string,
): string {
  const fields: Record<string, string> = {
    user: JSON.stringify({
      id: telegramId,
      first_name: "Test",
      ...(username ? { username } : {}),
    }),
    auth_date: String(authDate),
  };
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

async function postAuth(app: ReturnType<typeof buildApp>, initData: string) {
  return app.inject({
    method: "POST",
    url: "/auth",
    payload: { initData },
  });
}

// Mock-initData как его соберёт dev-сборка фронта вне Telegram: настоящие
// поля user/auth_date, но без валидной HMAC-подписи (её нельзя подделать
// без токена бота, а токен на фронт не попадает).
function mockInitData(telegramId: number): string {
  return new URLSearchParams({
    user: JSON.stringify({ id: telegramId, first_name: "Dev" }),
    auth_date: String(Math.floor(Date.now() / 1000)),
  }).toString();
}

describe("POST /auth", () => {
  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    process.env.ADMIN_TELEGRAM_IDS = String(ADMIN_ID_TG);
    delete process.env.AUTH_RATE_LIMIT_MAX;
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TEST_IDS));
  });

  it("покупатель: валидный initData → 200, JWT, sellerId null, isAdmin false", async () => {
    const app = buildApp();
    const response = await postAuth(app, signInitData(BUYER_ID));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.telegramId).toBe(BUYER_ID);
    expect(body.sellerId).toBeNull();
    expect(body.isAdmin).toBe(false);

    // JWT валиден и несёт те же способности, что и тело ответа.
    const payload = app.jwt.verify<{
      telegramId: number;
      sellerId: number | null;
      isAdmin: boolean;
    }>(body.token);
    expect(payload.telegramId).toBe(BUYER_ID);
    expect(payload.sellerId).toBeNull();
    expect(payload.isAdmin).toBe(false);

    await app.close();
  });

  it("username из initData попадает и в ответ, и в JWT", async () => {
    const app = buildApp();
    const response = await postAuth(
      app,
      signInitData(BUYER_ID, TEST_BOT_TOKEN, undefined, "someusername"),
    );

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.telegramUsername).toBe("someusername");

    const payload = app.jwt.verify<{ telegramUsername: string | null }>(
      body.token,
    );
    expect(payload.telegramUsername).toBe("someusername");

    await app.close();
  });

  it("без username в Telegram → telegramUsername null", async () => {
    const app = buildApp();
    const response = await postAuth(app, signInitData(BUYER_ID));

    expect(response.statusCode).toBe(200);
    expect(
      authResponseSchema.parse(response.json()).telegramUsername,
    ).toBeNull();

    await app.close();
  });

  it("продавец: активная запись в sellers → sellerId в ответе и в JWT", async () => {
    const [seller] = await db
      .insert(sellers)
      .values({
        telegramId: SELLER_ID_TG,
        telegramUsername: "auth_test_seller",
        fullName: "Тест Продавец",
        phone: "+70000000001",
        shopName: "Авторизация-тест",
        status: "active",
      })
      .returning({ id: sellers.id });

    const app = buildApp();
    const response = await postAuth(app, signInitData(SELLER_ID_TG));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.sellerId).toBe(seller!.id);

    await app.close();
  });

  it("заблокированный продавец: status=blocked → sellerId null, но sellerStatus/blockedReason различают его от незарегистрированного", async () => {
    await db.insert(sellers).values({
      telegramId: BLOCKED_ID_TG,
      telegramUsername: "auth_test_blocked",
      fullName: "Тест Заблокированный",
      phone: "+70000000002",
      shopName: "Блок-тест",
      status: "blocked",
      blockedReason: "Жалобы покупателей",
    });

    const app = buildApp();
    const response = await postAuth(app, signInitData(BLOCKED_ID_TG));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.sellerId).toBeNull();
    expect(body.sellerStatus).toBe("blocked");
    expect(body.blockedReason).toBe("Жалобы покупателей");

    await app.close();
  });

  it("удалённый продавец: status=deleted → sellerId null, но sellerStatus/deleteReason/deletedAt различают его от незарегистрированного", async () => {
    const deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await db.insert(sellers).values({
      telegramId: DELETED_ID_TG,
      telegramUsername: "auth_test_deleted",
      fullName: "Тест Удалённый",
      phone: "+70000000005",
      shopName: "Удалён-тест",
      status: "deleted",
      deleteReason: "Больше не продаю",
      deletedAt,
    });

    const app = buildApp();
    const response = await postAuth(app, signInitData(DELETED_ID_TG));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.sellerId).toBeNull();
    expect(body.sellerStatus).toBe("deleted");
    expect(body.deleteReason).toBe("Больше не продаю");
    expect(body.deletedAt?.getTime()).toBe(deletedAt.getTime());

    await app.close();
  });

  it("незарегистрированный пользователь: sellerId и sellerStatus оба null", async () => {
    const app = buildApp();
    const response = await postAuth(app, signInitData(BUYER_ID));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.sellerId).toBeNull();
    expect(body.sellerStatus).toBeNull();
    expect(body.blockedReason).toBeNull();

    await app.close();
  });

  it("админ: telegram_id в ADMIN_TELEGRAM_IDS → isAdmin true", async () => {
    const app = buildApp();
    const response = await postAuth(app, signInitData(ADMIN_ID_TG));

    expect(response.statusCode).toBe(200);
    expect(authResponseSchema.parse(response.json()).isAdmin).toBe(true);

    await app.close();
  });

  it("подделанная подпись → 401 без деталей", async () => {
    const initData = signInitData(BUYER_ID, "999999:WRONG-token");

    const app = buildApp();
    const response = await postAuth(app, initData);

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("протухший auth_date (старше 24ч) → 401", async () => {
    const dayAndHourAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 25;
    const initData = signInitData(BUYER_ID, TEST_BOT_TOKEN, dayAndHourAgo);

    const app = buildApp();
    const response = await postAuth(app, initData);

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("тело без initData → 400", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth",
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rate limit: сверх AUTH_RATE_LIMIT_MAX → 429", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "2";
    const app = buildApp();
    const initData = signInitData(BUYER_ID);

    expect((await postAuth(app, initData)).statusCode).toBe(200);
    expect((await postAuth(app, initData)).statusCode).toBe(200);
    expect((await postAuth(app, initData)).statusCode).toBe(429);

    await app.close();
  });

  it("dev off (по умолчанию): mock-initData без подписи → 401", async () => {
    delete process.env.AUTH_DEV_MODE;
    const app = buildApp();
    const response = await postAuth(app, mockInitData(BUYER_ID));

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});

describe("POST /auth — dev-режим (AUTH_DEV_MODE)", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const DEV_BUYER = 700100010;
  const DEV_SELLER = 700100011;
  const DEV_IDS = [DEV_BUYER, DEV_SELLER];

  beforeEach(async () => {
    process.env.AUTH_DEV_MODE = "true";
    process.env.NODE_ENV = "development";
    process.env.ADMIN_TELEGRAM_IDS = "";
    delete process.env.TELEGRAM_BOT_TOKEN; // dev-режим не требует токена бота
    delete process.env.AUTH_RATE_LIMIT_MAX;
    await db.delete(sellers).where(inArray(sellers.telegramId, DEV_IDS));
  });

  afterEach(() => {
    delete process.env.AUTH_DEV_MODE;
    process.env.NODE_ENV = savedNodeEnv;
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
  });

  it("покупатель: mock-initData без подписи → 200, тот же телеграм-id", async () => {
    const app = buildApp();
    const response = await postAuth(app, mockInitData(DEV_BUYER));

    expect(response.statusCode).toBe(200);
    const body = authResponseSchema.parse(response.json());
    expect(body.telegramId).toBe(DEV_BUYER);
    expect(body.sellerId).toBeNull();
    expect(body.isAdmin).toBe(false);

    await app.close();
  });

  it("резолв продавца работает так же, как в реальном режиме", async () => {
    const [seller] = await db
      .insert(sellers)
      .values({
        telegramId: DEV_SELLER,
        telegramUsername: "dev_mode_seller",
        fullName: "Дев Продавец",
        phone: "+70000000010",
        shopName: "Дев-режим-тест",
        status: "active",
      })
      .returning({ id: sellers.id });

    const app = buildApp();
    const response = await postAuth(app, mockInitData(DEV_SELLER));

    expect(response.statusCode).toBe(200);
    expect(authResponseSchema.parse(response.json()).sellerId).toBe(seller!.id);

    await app.close();
  });

  it("prod + AUTH_DEV_MODE=true → buildApp падает на старте", () => {
    process.env.NODE_ENV = "production";
    expect(() => buildApp()).toThrow();
  });
});

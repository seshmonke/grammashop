import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  registerSellerResponseSchema,
  restoreSellerResponseSchema,
  sellerProfileSchema,
} from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { sellers, subscriptions } from "../db/schema.js";

// /seller/register + /seller/profile — регистрация магазина до оплаты
// подписки и профиль (см. CONCEPT.md#оплата-подписки-продавцом, Спринт 21).
// Username берётся из JWT (см. auth.route.ts — приходит из initData),
// не из тела запроса — подделать нечем.

const NEW_TG = 700900001;
const NO_USERNAME_TG = 700900002;
const EXISTING_TG = 700900003;
const OTHER_TG = 700900004;
const ALL_TG = [NEW_TG, NO_USERNAME_TG, EXISTING_TG, OTHER_TG];

async function tokenFor(
  app: ReturnType<typeof buildApp>,
  opts: {
    telegramId: number;
    telegramUsername: string | null;
    sellerId: number | null;
  },
): Promise<string> {
  await app.ready();
  return app.jwt.sign({
    telegramId: opts.telegramId,
    telegramUsername: opts.telegramUsername,
    sellerId: opts.sellerId,
    isAdmin: false,
  });
}

async function req(
  app: ReturnType<typeof buildApp>,
  method: "GET" | "POST" | "PATCH",
  url: string,
  token?: string,
  body?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body ?? {},
  });
}

const validRegisterBody = {
  shopName: "Новый магазин",
  fullName: "Иван Иванов",
  phone: "+79990001122",
  consent: true,
};

describe("POST /seller/register", () => {
  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TG));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const res = await req(app, "POST", "/seller/register", undefined, validRegisterBody);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("без username в Telegram → 4xx с внятной причиной", async () => {
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: NO_USERNAME_TG,
      telegramUsername: null,
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/register", token, validRegisterBody);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.json().error).toMatch(/username/i);
    await app.close();
  });

  it("без согласия (consent) → 400", async () => {
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: NEW_TG,
      telegramUsername: "newuser",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/register", token, {
      ...validRegisterBody,
      consent: false,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("некорректное тело (пустое имя магазина) → 400", async () => {
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: NEW_TG,
      telegramUsername: "newuser",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/register", token, {
      ...validRegisterBody,
      shopName: "",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("валидные данные → 201, продавец создан со status active, без подписки", async () => {
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: NEW_TG,
      telegramUsername: "newuser",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/register", token, validRegisterBody);
    expect(res.statusCode).toBe(201);
    const body = registerSellerResponseSchema.parse(res.json());

    const [row] = await db
      .select()
      .from(sellers)
      .where(eq(sellers.id, body.id));
    expect(row?.telegramId).toBe(NEW_TG);
    expect(row?.telegramUsername).toBe("newuser");
    expect(row?.shopName).toBe("Новый магазин");
    expect(row?.fullName).toBe("Иван Иванов");
    expect(row?.phone).toBe("+79990001122");
    expect(row?.status).toBe("active");
    expect(row?.shopDescription).toBeNull();
    expect(row?.paymentDetails).toBeNull();

    await app.close();
  });

  it("повторная регистрация того же telegram_id → 409", async () => {
    await db.insert(sellers).values({
      telegramId: EXISTING_TG,
      telegramUsername: "existing",
      fullName: "Уже Есть",
      phone: "+79990001111",
      shopName: "Существующий",
      status: "active",
    });

    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: EXISTING_TG,
      telegramUsername: "existing",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/register", token, validRegisterBody);
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe("/seller/profile", () => {
  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TG));
  });

  async function seedSeller() {
    const [seller] = await db
      .insert(sellers)
      .values({
        telegramId: OTHER_TG,
        telegramUsername: "profileowner",
        fullName: "Профиль Владелец",
        phone: "+79990002222",
        shopName: "Профиль-магазин",
        shopDescription: null,
        paymentDetails: null,
        status: "active",
      })
      .returning({ id: sellers.id });
    return seller!.id;
  }

  it("GET без JWT с sellerId → 401/403", async () => {
    const app = buildApp();
    const res = await req(app, "GET", "/seller/profile");
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("GET: возвращает текущий профиль (без подписки — subscription null)", async () => {
    const sellerId = await seedSeller();
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: OTHER_TG,
      telegramUsername: "profileowner",
      sellerId,
    });
    const res = await req(app, "GET", "/seller/profile", token);
    expect(res.statusCode).toBe(200);
    const body = sellerProfileSchema.parse(res.json());
    expect(body.shopName).toBe("Профиль-магазин");
    expect(body.shopDescription).toBeNull();
    expect(body.paymentDetails).toBeNull();
    expect(body.subscription).toBeNull();
    await app.close();
  });

  it("GET: с активной подпиской возвращает её в профиле", async () => {
    const sellerId = await seedSeller();
    const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(subscriptions).values({
      sellerId,
      tier: "tier1",
      status: "active",
      paidUntil,
    });

    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: OTHER_TG,
      telegramUsername: "profileowner",
      sellerId,
    });
    const res = await req(app, "GET", "/seller/profile", token);
    expect(res.statusCode).toBe(200);
    const body = sellerProfileSchema.parse(res.json());
    expect(body.subscription).toEqual({
      tier: "tier1",
      status: "active",
      paidUntil: expect.any(Date),
    });
    await app.close();
  });

  it("PATCH: обновляет описание и реквизиты", async () => {
    const sellerId = await seedSeller();
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: OTHER_TG,
      telegramUsername: "profileowner",
      sellerId,
    });
    const res = await req(app, "PATCH", "/seller/profile", token, {
      shopDescription: "Продаём годноту",
      paymentDetails: "Карта 1234 5678 9012 3456",
    });
    expect(res.statusCode).toBe(200);
    const body = sellerProfileSchema.parse(res.json());
    expect(body.shopDescription).toBe("Продаём годноту");
    expect(body.paymentDetails).toBe("Карта 1234 5678 9012 3456");

    const [row] = await db
      .select()
      .from(sellers)
      .where(eq(sellers.id, sellerId));
    expect(row?.shopDescription).toBe("Продаём годноту");

    await app.close();
  });

  it("PATCH: пустое имя магазина → 400", async () => {
    const sellerId = await seedSeller();
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: OTHER_TG,
      telegramUsername: "profileowner",
      sellerId,
    });
    const res = await req(app, "PATCH", "/seller/profile", token, {
      shopName: "",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// Самоудаление + восстановление (см. Спринт 37,
// docs/tasks/37-seller-soft-delete-and-monitoring-retry.md).
describe("/seller/delete + /seller/restore", () => {
  const DELETE_TG = 700900010;
  const RESTORE_TG = 700900011;
  const RESTORE_EXPIRED_TG = 700900012;
  const RESTORE_NOT_DELETED_TG = 700900013;
  const DELETE_ALL_TG = [
    DELETE_TG,
    RESTORE_TG,
    RESTORE_EXPIRED_TG,
    RESTORE_NOT_DELETED_TG,
  ];

  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, DELETE_ALL_TG));
  });

  async function seedActiveSeller(telegramId: number) {
    const [seller] = await db
      .insert(sellers)
      .values({
        telegramId,
        telegramUsername: "deleteflow",
        fullName: "Удаляемый Продавец",
        phone: "+79990003333",
        shopName: "Магазин на удаление",
        status: "active",
      })
      .returning({ id: sellers.id });
    return seller!.id;
  }

  it("POST /seller/delete без причины → 400", async () => {
    const sellerId = await seedActiveSeller(DELETE_TG);
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: DELETE_TG,
      telegramUsername: "deleteflow",
      sellerId,
    });
    const res = await req(app, "POST", "/seller/delete", token, { reason: "" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("POST /seller/delete → 204, статус deleted, deletedAt/deleteReason проставлены", async () => {
    const sellerId = await seedActiveSeller(DELETE_TG);
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: DELETE_TG,
      telegramUsername: "deleteflow",
      sellerId,
    });
    const res = await req(app, "POST", "/seller/delete", token, {
      reason: "Закрываю магазин",
    });
    expect(res.statusCode).toBe(204);

    const [row] = await db.select().from(sellers).where(eq(sellers.id, sellerId));
    expect(row?.status).toBe("deleted");
    expect(row?.deleteReason).toBe("Закрываю магазин");
    expect(row?.deletedAt).toBeInstanceOf(Date);
    await app.close();
  });

  it("POST /seller/restore в пределах окна → 200, статус снова active", async () => {
    const sellerId = await seedActiveSeller(RESTORE_TG);
    await db
      .update(sellers)
      .set({
        status: "deleted",
        deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        deleteReason: "Передумал",
      })
      .where(eq(sellers.id, sellerId));

    const app = buildApp();
    // sellerId в токене null — так же, как реальный /auth выдал бы его
    // удалённому продавцу (см. auth/access.ts).
    const token = await tokenFor(app, {
      telegramId: RESTORE_TG,
      telegramUsername: "deleteflow",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/restore", token);
    expect(res.statusCode).toBe(200);
    const body = restoreSellerResponseSchema.parse(res.json());
    expect(body.id).toBe(sellerId);

    const [row] = await db.select().from(sellers).where(eq(sellers.id, sellerId));
    expect(row?.status).toBe("active");
    expect(row?.deletedAt).toBeNull();
    expect(row?.deleteReason).toBeNull();
    await app.close();
  });

  it("POST /seller/restore за пределами 30-дневного окна → 409, статус остаётся deleted", async () => {
    const sellerId = await seedActiveSeller(RESTORE_EXPIRED_TG);
    await db
      .update(sellers)
      .set({
        status: "deleted",
        deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        deleteReason: "Просрочено",
      })
      .where(eq(sellers.id, sellerId));

    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: RESTORE_EXPIRED_TG,
      telegramUsername: "deleteflow",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/restore", token);
    expect(res.statusCode).toBe(409);

    const [row] = await db.select().from(sellers).where(eq(sellers.id, sellerId));
    expect(row?.status).toBe("deleted");
    await app.close();
  });

  it("POST /seller/restore для не-удалённого продавца → 409", async () => {
    await seedActiveSeller(RESTORE_NOT_DELETED_TG);
    const app = buildApp();
    const token = await tokenFor(app, {
      telegramId: RESTORE_NOT_DELETED_TG,
      telegramUsername: "deleteflow",
      sellerId: null,
    });
    const res = await req(app, "POST", "/seller/restore", token);
    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

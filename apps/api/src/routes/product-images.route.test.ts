import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, gte, lte } from "drizzle-orm";
import sharp from "sharp";

// S3 — внешняя сеть, мокается на границе клиента (тот же приём, что и у
// bot/client.js в notifications/order-notification.test.ts), DB — реальная
// grammashop_test, без моков.
vi.mock("../s3/client.js", () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
  s3Bucket: "test-bucket",
  getPresignedImageUrl: vi.fn(
    async (key: string) => `https://s3.test/${key}?sig=stub`,
  ),
}));

import { s3Client } from "../s3/client.js";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { productImages, products, sellers } from "../db/schema.js";

const TG_START = 700450000;
let tgCounter = TG_START;
function nextTg(): number {
  tgCounter += 1;
  return tgCounter;
}

// Продавцы этого файла сеются с фиксированного tgCounter (не список
// констант, как в других route-тестах, — счётчик неизвестного размера) и
// без очистки не переживали повторный локальный `pnpm test`, падая на
// sellers_telegram_id_unique. Диапазон обрезан сверху текущим значением
// счётчика на момент afterAll (не голый gte) — иначе задевает продавцов
// других файлов с telegram_id выше TG_START (например, orders.route.test.ts),
// а их заказы блокируют удаление по FK (orders.seller_id — без onDelete
// cascade, см. schema.ts). products/productImages каскадятся от sellers.
afterAll(async () => {
  await db
    .delete(sellers)
    .where(and(gte(sellers.telegramId, TG_START), lte(sellers.telegramId, tgCounter)));
});

async function seedSeller(telegramId: number, username: string) {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId,
      telegramUsername: username,
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      status: "active",
    })
    .returning({ id: sellers.id });
  return seller!.id;
}

async function seedProduct(sellerId: number) {
  const [product] = await db
    .insert(products)
    .values({ sellerId, name: "Худи" })
    .returning({ id: products.id });
  return product!.id;
}

async function tokenFor(
  app: ReturnType<typeof buildApp>,
  sellerId: number | null,
): Promise<string> {
  await app.ready();
  return app.jwt.sign({ telegramId: 1, telegramUsername: null, sellerId, isAdmin: false });
}

async function makePngBuffer(side: number): Promise<Buffer> {
  return sharp({
    create: {
      width: side,
      height: side,
      channels: 3,
      background: { r: 10, g: 200, b: 30 },
    },
  })
    .png()
    .toBuffer();
}

function multipartBody(
  boundary: string,
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, buffer, tail]);
}

async function uploadImage(
  app: ReturnType<typeof buildApp>,
  productId: number,
  token: string,
  buffer: Buffer,
  mimetype = "image/png",
) {
  const boundary = "----grammashopTestBoundary";
  return app.inject({
    method: "POST",
    url: `/seller/products/${productId}/images`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody(boundary, buffer, "photo.png", mimetype),
  });
}

beforeEach(() => {
  vi.mocked(s3Client.send).mockClear();
});

describe("POST /seller/products/:id/images", () => {
  it("404 на чужую карточку", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img1");
    const otherId = await seedSeller(nextTg(), "other_img1");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, otherId);

    const buffer = await makePngBuffer(300);
    const res = await uploadImage(app, productId, token, buffer);

    expect(res.statusCode).toBe(404);
  });

  it("400 на неподдерживаемый MIME-тип", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img2");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const buffer = Buffer.from("not an image");
    const res = await uploadImage(app, productId, token, buffer, "text/plain");

    expect(res.statusCode).toBe(400);
  });

  it("добавляет фото: объект+thumbnail в S3, строка в product_images, presigned-ссылки в ответе", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img3");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const buffer = await makePngBuffer(300);
    const res = await uploadImage(app, productId, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.images).toHaveLength(1);
    expect(body.images[0].url).toContain("https://s3.test/");
    expect(body.images[0].thumbnailUrl).toContain("-thumb.webp");
    expect(typeof body.images[0].id).toBe("number");

    expect(s3Client.send).toHaveBeenCalledTimes(2);

    const rows = await db
      .select({ s3Key: productImages.s3Key })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.s3Key).toMatch(new RegExp(`^products/${ownerId}/${productId}/`));
  });

  it("повторная загрузка добавляет второе фото, не заменяет первое", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img4");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const first = await uploadImage(app, productId, token, await makePngBuffer(300));
    expect(first.statusCode).toBe(200);
    const second = await uploadImage(app, productId, token, await makePngBuffer(300));
    expect(second.statusCode).toBe(200);

    expect(second.json().images).toHaveLength(2);
    // 2 PUT на каждую загрузку, замены/удаления нет
    expect(s3Client.send).toHaveBeenCalledTimes(4);

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(2);
  });

  it("400 на 6-е фото (лимит 5)", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img_limit");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    for (let i = 0; i < 5; i++) {
      const res = await uploadImage(app, productId, token, await makePngBuffer(300));
      expect(res.statusCode).toBe(200);
    }

    const sixth = await uploadImage(app, productId, token, await makePngBuffer(300));
    expect(sixth.statusCode).toBe(400);

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(5);
  });
});

describe("DELETE /seller/products/:id/images/:imageId", () => {
  it("404, если фото с таким id нет", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img5");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/images/999999`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("удаляет фото по id: 204, объекты из S3, строка из БД, остальные фото не тронуты", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img6");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const first = await uploadImage(app, productId, token, await makePngBuffer(300));
    const second = await uploadImage(app, productId, token, await makePngBuffer(300));
    const firstId = first.json().images[0].id;
    const secondImageId = second.json().images[1].id;
    vi.mocked(s3Client.send).mockClear();

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/images/${firstId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(s3Client.send).toHaveBeenCalledTimes(2);

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(secondImageId);
  });

  it("404 на чужую карточку", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img7");
    const otherId = await seedSeller(nextTg(), "other_img7");
    const productId = await seedProduct(ownerId);
    const ownerToken = await tokenFor(app, ownerId);
    const otherToken = await tokenFor(app, otherId);

    const uploaded = await uploadImage(app, productId, ownerToken, await makePngBuffer(300));
    const imageId = uploaded.json().images[0].id;

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/images/${imageId}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("PATCH /seller/products/:id/images/:imageId/move", () => {
  it("меняет местами с соседом при направлении right", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img8");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const first = await uploadImage(app, productId, token, await makePngBuffer(300));
    const second = await uploadImage(app, productId, token, await makePngBuffer(300));
    const firstId = first.json().images[0].id;
    const secondId = second.json().images[1].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/seller/products/${productId}/images/${firstId}/move`,
      headers: { authorization: `Bearer ${token}` },
      payload: { direction: "right" },
    });

    expect(res.statusCode).toBe(200);
    const images = res.json().images as Array<{ id: number }>;
    expect(images.map((i) => i.id)).toEqual([secondId, firstId]);
  });

  it("no-op на краю списка (движение left первого фото)", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img9");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const first = await uploadImage(app, productId, token, await makePngBuffer(300));
    await uploadImage(app, productId, token, await makePngBuffer(300));
    const firstId = first.json().images[0].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/seller/products/${productId}/images/${firstId}/move`,
      headers: { authorization: `Bearer ${token}` },
      payload: { direction: "left" },
    });

    expect(res.statusCode).toBe(200);
    const images = res.json().images as Array<{ id: number }>;
    expect(images[0]?.id).toBe(firstId);
  });

  it("404 на чужую карточку", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img10");
    const otherId = await seedSeller(nextTg(), "other_img10");
    const productId = await seedProduct(ownerId);
    const ownerToken = await tokenFor(app, ownerId);
    const otherToken = await tokenFor(app, otherId);

    const first = await uploadImage(app, productId, ownerToken, await makePngBuffer(300));
    const firstId = first.json().images[0].id;

    const res = await app.inject({
      method: "PATCH",
      url: `/seller/products/${productId}/images/${firstId}/move`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { direction: "right" },
    });

    expect(res.statusCode).toBe(404);
  });
});

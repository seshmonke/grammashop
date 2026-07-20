import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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

let tgCounter = 700450000;
function nextTg(): number {
  tgCounter += 1;
  return tgCounter;
}

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
  return app.jwt.sign({ telegramId: 1, sellerId, isAdmin: false });
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
    url: `/seller/products/${productId}/image`,
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

describe("POST /seller/products/:id/image", () => {
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

  it("загружает фото: 2 объекта в S3, строка в product_images, presigned-ссылки в ответе", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img3");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const buffer = await makePngBuffer(300);
    const res = await uploadImage(app, productId, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.image.url).toContain("https://s3.test/");
    expect(body.image.thumbnailUrl).toContain("-thumb.webp");

    expect(s3Client.send).toHaveBeenCalledTimes(2);

    const [row] = await db
      .select({ s3Key: productImages.s3Key })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(row?.s3Key).toMatch(new RegExp(`^products/${ownerId}/${productId}/`));
  });

  it("повторная загрузка заменяет фото: удаляет старые объекты, оставляет одну строку", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img4");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const first = await uploadImage(app, productId, token, await makePngBuffer(300));
    expect(first.statusCode).toBe(200);
    const firstKey = first.json().image.url;

    const second = await uploadImage(app, productId, token, await makePngBuffer(300));
    expect(second.statusCode).toBe(200);
    expect(second.json().image.url).not.toBe(firstKey);

    // 2 PUT на первую загрузку + 2 PUT и 2 DELETE на замену
    expect(s3Client.send).toHaveBeenCalledTimes(6);

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(1);
  });
});

describe("DELETE /seller/products/:id/image", () => {
  it("404, если фото не загружено", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img5");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/image`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("удаляет фото: 204, объекты из S3, строка из БД", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img6");
    const productId = await seedProduct(ownerId);
    const token = await tokenFor(app, ownerId);

    await uploadImage(app, productId, token, await makePngBuffer(300));
    vi.mocked(s3Client.send).mockClear();

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/image`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(s3Client.send).toHaveBeenCalledTimes(2);

    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId));
    expect(rows).toHaveLength(0);
  });

  it("404 на чужую карточку", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_img7");
    const otherId = await seedSeller(nextTg(), "other_img7");
    const productId = await seedProduct(ownerId);
    const ownerToken = await tokenFor(app, ownerId);
    const otherToken = await tokenFor(app, otherId);

    await uploadImage(app, productId, ownerToken, await makePngBuffer(300));

    const res = await app.inject({
      method: "DELETE",
      url: `/seller/products/${productId}/image`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

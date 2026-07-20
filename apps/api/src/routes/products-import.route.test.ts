import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { products, productVariants, sellers } from "../db/schema.js";

let tgCounter = 700460000;
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

async function tokenFor(
  app: ReturnType<typeof buildApp>,
  sellerId: number | null,
): Promise<string> {
  await app.ready();
  return app.jwt.sign({ telegramId: 1, telegramUsername: null, sellerId, isAdmin: false });
}

type Row = [
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
];

async function buildXlsx(rows: Row[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Товары");
  sheet.addRow(["Название", "Описание", "Вариант", "Цена", "Старая цена", "Остаток"]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function multipartBody(boundary: string, buffer: Buffer, filename: string, mimetype: string): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, buffer, tail]);
}

async function uploadImport(
  app: ReturnType<typeof buildApp>,
  token: string | null,
  buffer: Buffer,
  mimetype = XLSX_MIME,
) {
  const boundary = "----grammashopImportBoundary";
  return app.inject({
    method: "POST",
    url: "/seller/products/import",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload: multipartBody(boundary, buffer, "catalog.xlsx", mimetype),
  });
}

describe("POST /seller/products/import", () => {
  it("401 без JWT", async () => {
    const app = buildApp();
    const buffer = await buildXlsx([["Футболка", null, "S", 1990, null, null]]);

    const res = await uploadImport(app, null, buffer);

    expect(res.statusCode).toBe(401);
  });

  it("403 покупателю без sellerId", async () => {
    const app = buildApp();
    const token = await tokenFor(app, null);
    const buffer = await buildXlsx([["Футболка", null, "S", 1990, null, null]]);

    const res = await uploadImport(app, token, buffer);

    expect(res.statusCode).toBe(403);
  });

  it("400 на не-xlsx MIME", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_imp1");
    const token = await tokenFor(app, ownerId);

    const res = await uploadImport(app, token, Buffer.from("not xlsx"), "text/plain");

    expect(res.statusCode).toBe(400);
  });

  it("создаёт валидные карточки с вариантами, копейки посчитаны верно", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_imp2");
    const token = await tokenFor(app, ownerId);
    const buffer = await buildXlsx([
      ["Футболка", "Хлопок", "S", 1990, null, 5],
      ["Футболка", "Хлопок", "M", 1990, 2490, 3],
      ["Худи", null, "Единственный", 3500, null, null],
    ]);

    const res = await uploadImport(app, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ createdCount: 2, errors: [] });

    const rows = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.sellerId, ownerId));
    expect(rows.map((r) => r.name).sort()).toEqual(["Футболка", "Худи"]);

    const tshirt = rows.find((r) => r.name === "Футболка")!;
    const variants = await db
      .select({ name: productVariants.name, priceKopecks: productVariants.priceKopecks })
      .from(productVariants)
      .where(eq(productVariants.productId, tshirt.id));
    expect(variants).toEqual(
      expect.arrayContaining([
        { name: "S", priceKopecks: 199000 },
        { name: "M", priceKopecks: 199000 },
      ]),
    );
  });

  it("партиальный импорт: валидные карточки создаются, невалидные строки — в отчёт", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_imp3");
    const token = await tokenFor(app, ownerId);
    const buffer = await buildXlsx([
      ["Футболка", null, "S", 1990, null, null],
      [null, null, "M", 1990, null, null],
      ["Худи", null, "Единственный", -1, null, null],
    ]);

    const res = await uploadImport(app, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.createdCount).toBe(1);
    expect(body.errors).toEqual([
      { row: 3, error: "не заполнено название карточки" },
      { row: 4, error: "цена должна быть больше 0" },
    ]);

    const rows = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.sellerId, ownerId));
    expect(rows.map((r) => r.name)).toEqual(["Футболка"]);
  });

  it("карточка с 11 вариантами — ошибка на все её строки, карточка не создаётся", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_imp4");
    const token = await tokenFor(app, ownerId);
    const rows: Row[] = Array.from({ length: 11 }, (_, i) => [
      "Слишком много вариантов",
      null,
      `Вариант ${i + 1}`,
      100,
      null,
      null,
    ]);
    const buffer = await buildXlsx(rows);

    const res = await uploadImport(app, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.createdCount).toBe(0);
    expect(body.errors).toHaveLength(11);

    const created = await db
      .select({ name: products.name })
      .from(products)
      .where(eq(products.sellerId, ownerId));
    expect(created).toEqual([]);
  });

  it("лимит карточек продавца (30) — превышающие строки в отчёт, не 500", async () => {
    const app = buildApp();
    const ownerId = await seedSeller(nextTg(), "owner_imp5");
    const token = await tokenFor(app, ownerId);

    for (let i = 0; i < 29; i++) {
      await db.insert(products).values({ sellerId: ownerId, name: `Товар ${i}` });
    }

    const buffer = await buildXlsx([
      ["Новый 1", null, "Единственный", 100, null, null],
      ["Новый 2", null, "Единственный", 100, null, null],
    ]);

    const res = await uploadImport(app, token, buffer);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.createdCount).toBe(1);
    expect(body.errors).toEqual([
      { row: 3, error: "лимит карточек товара исчерпан (30 на Тарифе 1)" },
    ]);
  });
});

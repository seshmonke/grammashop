import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseImportWorkbook } from "./parse-workbook.js";

type Row = [
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
];

async function buildWorkbook(rows: Row[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Товары");
  sheet.addRow(["Название", "Описание", "Вариант", "Цена", "Старая цена", "Остаток"]);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseImportWorkbook", () => {
  it("группирует строки-варианты в карточки по названию, рубли → копейки", async () => {
    const buffer = await buildWorkbook([
      ["Футболка", "Хлопок", "S", 1990, null, 5],
      ["Футболка", "Хлопок", "M", 1990, 2490, 3],
      ["Худи", null, "Единственный", 3500, null, null],
    ]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([]);
    expect(result.products).toHaveLength(2);

    const tshirt = result.products.find((p) => p.name === "Футболка")!;
    expect(tshirt.description).toBe("Хлопок");
    expect(tshirt.variants).toEqual([
      { name: "S", priceKopecks: 199000, oldPriceKopecks: null, stock: 5 },
      { name: "M", priceKopecks: 199000, oldPriceKopecks: 249000, stock: 3 },
    ]);

    const hoodie = result.products.find((p) => p.name === "Худи")!;
    expect(hoodie.description).toBeNull();
    expect(hoodie.variants).toEqual([
      { name: "Единственный", priceKopecks: 350000, oldPriceKopecks: null, stock: null },
    ]);
  });

  it("не заполненное название карточки — ошибка строки, карточка не создаётся", async () => {
    const buffer = await buildWorkbook([[null, null, "S", 1990, null, null]]);

    const result = await parseImportWorkbook(buffer);

    expect(result.products).toEqual([]);
    expect(result.rowErrors).toEqual([
      { row: 2, error: "не заполнено название карточки" },
    ]);
  });

  it("не заполненное название варианта — ошибка строки", async () => {
    const buffer = await buildWorkbook([["Футболка", null, null, 1990, null, null]]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([
      { row: 2, error: "не заполнено название варианта" },
    ]);
  });

  it("цена <= 0 или нечисловая — ошибка строки", async () => {
    const buffer = await buildWorkbook([
      ["Футболка", null, "S", 0, null, null],
      ["Худи", null, "M", -100, null, null],
    ]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([
      { row: 2, error: "цена должна быть больше 0" },
      { row: 3, error: "цена должна быть больше 0" },
    ]);
  });

  it("старая цена и остаток опциональны, но при заполнении валидируются", async () => {
    const buffer = await buildWorkbook([
      ["Футболка", null, "S", 1990, 0, null],
      ["Худи", null, "M", 1990, null, -1],
    ]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([
      { row: 2, error: "старая цена должна быть больше 0" },
      { row: 3, error: "остаток должен быть целым числом от 0" },
    ]);
  });

  it("полностью пустая строка молча пропускается", async () => {
    const buffer = await buildWorkbook([
      ["Футболка", null, "S", 1990, null, null],
      [null, null, null, null, null, null],
      ["Худи", null, "M", 2990, null, null],
    ]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([]);
    expect(result.products.map((p) => p.name)).toEqual(["Футболка", "Худи"]);
  });

  it("невалидная строка не мешает распарсить валидные варианты той же карточки", async () => {
    const buffer = await buildWorkbook([
      ["Футболка", null, "S", 1990, null, null],
      ["Футболка", null, "M", -1, null, null],
      ["Футболка", null, "L", 2490, null, null],
    ]);

    const result = await parseImportWorkbook(buffer);

    expect(result.rowErrors).toEqual([
      { row: 3, error: "цена должна быть больше 0" },
    ]);
    const tshirt = result.products.find((p) => p.name === "Футболка")!;
    expect(tshirt.variants.map((v) => v.name)).toEqual(["S", "L"]);
  });
});

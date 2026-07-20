import ExcelJS from "exceljs";

// Разбор шаблона пакетной заливки каталога (см.
// STACK.md#пакетная-заливка-каталога-спринт-18). Чистая функция над
// буфером — без БД, лимиты карточек/вариантов проверяются в
// services/products-import.service.ts тем же путём, что и у ручного
// создания. Плоская таблица: одна строка = один вариант, название и
// описание карточки повторяются на каждой строке.

export interface ParsedImportRowError {
  row: number;
  error: string;
}

export interface ParsedImportVariant {
  name: string;
  priceKopecks: number;
  oldPriceKopecks: number | null;
  stock: number | null;
}

export interface ParsedImportProduct {
  name: string;
  description: string | null;
  variants: ParsedImportVariant[];
  rows: number[];
}

export interface ParsedImportWorkbook {
  products: ParsedImportProduct[];
  rowErrors: ParsedImportRowError[];
}

const HEADER_ROWS = 1;

function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value).trim();
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRowBlank(cells: string[]): boolean {
  return cells.every((c) => c === "");
}

export async function parseImportWorkbook(
  buffer: Buffer,
): Promise<ParsedImportWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];

  const rowErrors: ParsedImportRowError[] = [];
  const groups = new Map<string, ParsedImportProduct>();

  if (!sheet) return { products: [], rowErrors };

  const lastRow = sheet.lastRow?.number ?? HEADER_ROWS;
  for (let rowNumber = HEADER_ROWS + 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = cellText(row.getCell(1).value);
    const description = cellText(row.getCell(2).value);
    const variantName = cellText(row.getCell(3).value);
    const priceRaw = row.getCell(4).value;
    const oldPriceRaw = row.getCell(5).value;
    const stockRaw = row.getCell(6).value;

    if (isRowBlank([name, description, variantName, cellText(priceRaw)])) {
      continue;
    }

    if (!name) {
      rowErrors.push({ row: rowNumber, error: "не заполнено название карточки" });
      continue;
    }
    if (!variantName) {
      rowErrors.push({ row: rowNumber, error: "не заполнено название варианта" });
      continue;
    }
    const priceRubles = cellNumber(priceRaw);
    if (priceRubles === null || priceRubles <= 0) {
      rowErrors.push({ row: rowNumber, error: "цена должна быть больше 0" });
      continue;
    }
    const oldPriceRubles = cellNumber(oldPriceRaw);
    if (oldPriceRaw != null && cellText(oldPriceRaw) !== "" && (oldPriceRubles === null || oldPriceRubles <= 0)) {
      rowErrors.push({ row: rowNumber, error: "старая цена должна быть больше 0" });
      continue;
    }
    const stock = cellNumber(stockRaw);
    if (stockRaw != null && cellText(stockRaw) !== "" && (stock === null || stock < 0 || !Number.isInteger(stock))) {
      rowErrors.push({ row: rowNumber, error: "остаток должен быть целым числом от 0" });
      continue;
    }

    const variant: ParsedImportVariant = {
      name: variantName,
      priceKopecks: rublesToKopecks(priceRubles),
      oldPriceKopecks: oldPriceRubles !== null ? rublesToKopecks(oldPriceRubles) : null,
      stock,
    };

    const existing = groups.get(name);
    if (existing) {
      existing.variants.push(variant);
      existing.rows.push(rowNumber);
    } else {
      groups.set(name, {
        name,
        description: description || null,
        variants: [variant],
        rows: [rowNumber],
      });
    }
  }

  return { products: [...groups.values()], rowErrors };
}

import { createProductRequestSchema } from "@grammashop/shared";
import type { ProductImportRowError } from "@grammashop/shared";
import { parseImportWorkbook } from "../products-import/parse-workbook.js";
import { createProduct } from "./products.service.js";

// Оркестрация пакетной заливки (см.
// STACK.md#пакетная-заливка-каталога-спринт-18): разбор — чистая функция
// (parse-workbook.ts), группа проверяется той же Zod-схемой, что и ручное
// создание карточки, создание идёт через тот же services/products.service.ts
// (лимиты 30/10 проверяются там, не дублируются здесь). Партиальный импорт:
// одна невалидная группа не мешает создать остальные.
export async function importProducts(
  sellerId: number,
  buffer: Buffer,
): Promise<{ createdCount: number; errors: ProductImportRowError[] }> {
  const { products: groups, rowErrors } = await parseImportWorkbook(buffer);

  const errors: ProductImportRowError[] = [...rowErrors];
  let createdCount = 0;

  for (const group of groups) {
    const parsed = createProductRequestSchema.safeParse({
      name: group.name,
      description: group.description,
      variants: group.variants,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "некорректные данные карточки";
      for (const row of group.rows) errors.push({ row, error: message });
      continue;
    }

    const result = await createProduct(sellerId, parsed.data);
    if (!result.ok) {
      for (const row of group.rows) {
        errors.push({ row, error: "лимит карточек товара исчерпан (30 на Тарифе 1)" });
      }
      continue;
    }

    createdCount += 1;
  }

  errors.sort((a, b) => a.row - b.row);
  return { createdCount, errors };
}

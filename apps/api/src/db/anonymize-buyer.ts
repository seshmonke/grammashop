import "../env.js";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { orders } from "./schema.js";

// Обезличивание покупателя (152-ФЗ), см. CONCEPT.md#персональные-данные-152-фз
// и docs/tasks/35-buyer-pdn-rights-and-returns.md. В отличие от
// anonymize-seller.ts ПДн покупателя лежат не в одной строке, а снапшотом в
// каждом его заказе — обнуляются во всех разом.
//
// Обнуляет только buyerFullName/buyerPhone/buyerAddress/buyerComment —
// buyerTelegramId не трогается (аналогично тому, что telegramId не
// обнуляется у продавца).
//
// Запускать вручную: `pnpm --filter @grammashop/api tsx src/db/anonymize-buyer.ts <buyerTelegramId>`
// (в проде — скомпилированный `node dist/db/anonymize-buyer.js <buyerTelegramId>`).

async function main(): Promise<void> {
  const rawId = process.argv[2];
  const buyerTelegramId = rawId ? Number(rawId) : NaN;
  if (!rawId || !Number.isInteger(buyerTelegramId)) {
    throw new Error(
      "anonymize-buyer: нужен числовой buyerTelegramId первым аргументом",
    );
  }

  const rows = await db
    .update(orders)
    .set({ buyerFullName: "", buyerPhone: "", buyerAddress: "", buyerComment: null })
    .where(eq(orders.buyerTelegramId, buyerTelegramId))
    .returning({ id: orders.id });

  if (rows.length === 0) {
    throw new Error(`anonymize-buyer: заказов покупателя #${buyerTelegramId} не найдено`);
  }

  console.log(
    `anonymize-buyer: покупатель #${buyerTelegramId} обезличен — ${rows.length} заказ(ов) обновлено.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

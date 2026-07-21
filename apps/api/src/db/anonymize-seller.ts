import "../env.js";
import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { sellers } from "./schema.js";

// Обезличивание продавца (152-ФЗ) вместо удаления строки: `orders`
// продавца хранят ПДн *покупателей* (снапшотом), каскадное удаление
// `sellers` потянуло бы за собой чужие данные и историю заказов для
// бухгалтерии. См. CONCEPT.md#персональные-данные-152-фз и
// docs/tasks/23-pdn-and-cheap-debt.md.
//
// Обнуляет только fullName/phone/paymentDetails — telegramId,
// telegramUsername, shopName не трогаются (аналогично тому, что
// buyerTelegramId не обнуляется у покупателя).
//
// Запускать вручную: `pnpm --filter @grammashop/api tsx src/db/anonymize-seller.ts <sellerId>`
// (в проде — скомпилированный `node dist/db/anonymize-seller.js <sellerId>`).

async function main(): Promise<void> {
  const rawId = process.argv[2];
  const sellerId = rawId ? Number(rawId) : NaN;
  if (!rawId || !Number.isInteger(sellerId)) {
    throw new Error(
      "anonymize-seller: нужен числовой sellerId первым аргументом",
    );
  }

  const [row] = await db
    .update(sellers)
    .set({ fullName: "", phone: "", paymentDetails: null })
    .where(eq(sellers.id, sellerId))
    .returning({ id: sellers.id, shopName: sellers.shopName });

  if (!row) {
    throw new Error(`anonymize-seller: продавец #${sellerId} не найден`);
  }

  console.log(
    `anonymize-seller: продавец #${row.id} (${row.shopName}) обезличен — fullName/phone/paymentDetails обнулены.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

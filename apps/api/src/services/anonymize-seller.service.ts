import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sellers } from "../db/schema.js";

// Обезличивание продавца (152-ФЗ) вместо удаления строки: `orders`
// продавца хранят ПДн *покупателей* снапшотом, каскадное удаление
// `sellers` потянуло бы за собой чужие данные и историю заказов для
// бухгалтерии. См. CONCEPT.md#персональные-данные-152-фз,
// docs/tasks/23-pdn-and-cheap-debt.md.
//
// Вызывается и вручную (db/anonymize-seller.ts — CLI на случай, если
// понадобится обезличить раньше срока), и автоматически по истечении
// окна восстановления (sellers/finalize-deletion-worker.ts, Спринт 37).
//
// Обнуляет только fullName/phone/paymentDetails — telegramId,
// telegramUsername, shopName не трогаются (аналогично тому, что
// buyerTelegramId не обнуляется у покупателя). Идемпотентно: повторный
// вызов на уже обезличенном продавце просто перезаписывает пустые поля
// теми же пустыми значениями.
export async function anonymizeSeller(
  sellerId: number,
): Promise<{ id: number; shopName: string } | null> {
  const [row] = await db
    .update(sellers)
    .set({ fullName: "", phone: "", paymentDetails: null })
    .where(eq(sellers.id, sellerId))
    .returning({ id: sellers.id, shopName: sellers.shopName });
  return row ?? null;
}

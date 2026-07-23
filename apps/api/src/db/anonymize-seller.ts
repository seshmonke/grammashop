import "../env.js";
import { anonymizeSeller } from "../services/anonymize-seller.service.js";

// CLI-обёртка над anonymizeSeller (см.
// services/anonymize-seller.service.ts) — обезличить продавца вручную,
// раньше истечения 30-дневного окна восстановления (обычная дорога —
// автоматический воркер, sellers/finalize-deletion-worker.ts, Спринт 37).
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

  const row = await anonymizeSeller(sellerId);
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

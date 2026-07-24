import type { ProductStatus } from "@grammashop/shared";

// Бейдж статуса витрины карточки (см. CONCEPT.md#жизненный-цикл-сущностей):
// active — на витрине (акцентный), hidden — черновик/снята (приглушённый).
// Общий для списка товаров (SellerHome) и формы карточки (ProductForm).
export function ProductStatusPill({ status }: { status: ProductStatus }) {
  const active = status === "active";
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
        active ? "bg-tg-bg text-tg-success" : "bg-tg-bg text-tg-hint"
      }`}
    >
      {active ? "На витрине" : "Черновик"}
    </span>
  );
}

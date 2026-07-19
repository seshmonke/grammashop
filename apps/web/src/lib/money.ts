// Копейки (int из БД) → рубли для витрины. Целые суммы — без «,00»,
// дробные — с копейками через запятую (ru-RU). Форматирование только на
// фронте, в контракте деньги остаются копейками (см. STACK.md#доменная-схема-v1).
export function formatPrice(kopecks: number): string {
  const hasKopecks = kopecks % 100 !== 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(kopecks / 100);
}

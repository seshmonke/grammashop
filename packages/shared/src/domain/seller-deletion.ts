// Окно самостоятельного восстановления после удаления магазина (см.
// Спринт 37, docs/tasks/37-seller-soft-delete-and-monitoring-retry.md).
// Общий источник для бэка (services/seller.service.ts — гейт
// восстановления и финальное обезличивание) и фронта (DeletedSeller.tsx —
// дата истечения на экране) — число не должно разъехаться между ними.
export const SELLER_RESTORE_WINDOW_DAYS = 30;

export function restoreWindowEnd(deletedAt: Date): Date {
  const end = new Date(deletedAt);
  end.setDate(end.getDate() + SELLER_RESTORE_WINDOW_DAYS);
  return end;
}

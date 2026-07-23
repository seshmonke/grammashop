// Кодирование orderId в start_param диплинка на заказ (Спринт 36, см.
// STACK.md#авторизация) — общий формат для генерации (api/notifications/
// order-notification.ts) и разбора (web/auth/Landing.tsx), чтобы формат не
// разъехался между сторонами. Префикс "o" отличает диплинк на заказ от
// голого числового seller_id витрины и служебного значения "register"
// (см. web/auth/Landing.tsx) — все три формата живут в одном start_param.
const ORDER_START_PARAM_PREFIX = "o";

export function encodeOrderStartParam(orderId: number): string {
  return `${ORDER_START_PARAM_PREFIX}${orderId}`;
}

export function decodeOrderStartParam(startParam: string): number | null {
  if (!startParam.startsWith(ORDER_START_PARAM_PREFIX)) return null;
  const id = Number(startParam.slice(ORDER_START_PARAM_PREFIX.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

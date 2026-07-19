import { getStartParam } from "../lib/telegram";

// seller_id витрины — из start_param ТМА-ссылки (t.me/<bot>/shop?startapp=<id>).
// В dev-браузере start_param нет: фолбэк на VITE_DEV_SELLER_ID, чтобы верстать
// витрину без Telegram. undefined — витрина открыта без магазина (заглушка).
export function resolveSellerId(): number | undefined {
  const raw =
    getStartParam() ??
    (import.meta.env.DEV ? import.meta.env["VITE_DEV_SELLER_ID"] : undefined);
  if (raw == null || raw === "") return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

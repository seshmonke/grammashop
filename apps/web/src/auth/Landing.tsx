import { Navigate } from "react-router-dom";
import { decodeOrderStartParam } from "@grammashop/shared";
import { useSession } from "./session-context";
import { getStartParam } from "../lib/telegram";
import { StorefrontHome } from "../routes/storefront/StorefrontHome";
import { Fork } from "./Fork";
import { BlockedSeller } from "./BlockedSeller";

// Служебное значение start_param для формы регистрации магазина (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21) — диплинк
// t.me/<бот>/shop?startapp=register. С числовыми seller_id не пересекается
// (Number("register") === NaN, resolveSellerId уже это фильтрует).
const REGISTER_START_PARAM = "register";

// Экран входа `/` (см. STACK.md#роутинг). Приоритет — start_param: диплинк
// на заказ (`o<orderId>`, кнопка в уведомлении продавцу, Спринт 36) — сразу
// на этот заказ в его админке, но только если вошедший и есть продавец
// этого заказа (иначе диплинк не для него — падаем дальше, тот же принцип
// мягкой деградации, что и у прочих невалидных start_param); голый
// seller_id — открываем витрину этого продавца, кем бы ни был вошедший
// (продавец тоже может смотреть чужой магазин); `register` — на форму
// регистрации (у пользователя с уже существующим магазином — в его
// админку, CTA лендинга не должен приводить продавца на форму с 409). Без
// start_param — по роли: заблокированный продавец на экран блокировки
// (BlockedSeller, Спринт 32), иначе продавец в свою админку, админ в
// платформенную, покупатель без параметра и без роли — на экран-развилку
// (Fork: «О платформе» / «Запустить магазин»).
export function Landing() {
  const session = useSession();
  const startParam = getStartParam();
  const orderId = startParam ? decodeOrderStartParam(startParam) : null;

  if (orderId != null && session.sellerId != null) {
    return <Navigate to={`/seller/orders/${orderId}`} replace />;
  }
  if (startParam === REGISTER_START_PARAM) {
    if (session.sellerId != null) {
      return <Navigate to="/seller" replace />;
    }
    return <Navigate to="/register" replace />;
  }
  if (startParam) {
    return <StorefrontHome />;
  }
  // Заблокированный продавец (sellerId уже null от resolveAuthContext) —
  // понятный экран вместо развилки Fork («никогда не регистрировался»),
  // см. Спринт 32.
  if (session.sellerStatus === "blocked") {
    return <BlockedSeller reason={session.blockedReason} />;
  }
  if (session.sellerId != null) {
    return <Navigate to="/seller" replace />;
  }
  if (session.isAdmin) {
    return <Navigate to="/platform" replace />;
  }
  return <Fork />;
}

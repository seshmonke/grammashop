import { Navigate } from "react-router-dom";
import { useSession } from "./session-context";
import { getStartParam } from "../lib/telegram";
import { StorefrontHome } from "../routes/storefront/StorefrontHome";

// Экран входа `/` (см. STACK.md#роутинг). Приоритет — start_param: если в
// ТМА-ссылке пришёл seller_id, открываем витрину этого продавца, кем бы ни
// был вошедший (продавец тоже может смотреть чужой магазин). Иначе — по
// роли: продавец в свою админку, админ в платформенную, покупатель без
// параметра остаётся на витрине-заглушке («магазин открывается по ссылке
// продавца» — доводится в задаче витрины).
export function Landing() {
  const session = useSession();
  const startParam = getStartParam();

  if (startParam) {
    return <StorefrontHome />;
  }
  if (session.sellerId != null) {
    return <Navigate to="/seller" replace />;
  }
  if (session.isAdmin) {
    return <Navigate to="/platform" replace />;
  }
  return <StorefrontHome />;
}

import { Link } from "react-router-dom";
import { formatPrice } from "../lib/money";
import { useCart } from "./cart-context";
import { cartCount, cartTotalKopecks } from "./cart-reducer";

// Мини-корзина: плавающая плашка внизу витрины/карточки товара, видна
// только когда в корзине что-то есть, ведёт на полный экран корзины (см.
// STACK.md#роутинг, карта экранов).
export function MiniCartBar() {
  const { state } = useCart();
  const count = cartCount(state);
  if (count === 0) return null;

  return (
    <Link
      to="/cart"
      className="tg-glass fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl border border-tg-separator px-4 py-3 shadow-lg"
    >
      <span className="text-sm font-medium text-tg-text">
        Корзина · {count} {count === 1 ? "товар" : "товара"}
      </span>
      <span className="font-semibold text-tg-text tabular-nums">
        {formatPrice(cartTotalKopecks(state))}
      </span>
    </Link>
  );
}

import { Link } from "react-router-dom";
import { formatPrice } from "../../lib/money";
import { useCart } from "../../cart/cart-context";
import { cartTotalKopecks } from "../../cart/cart-reducer";

// Экран корзины (см. STACK.md#роутинг, карта экранов: каталог → карточка →
// корзина → чекаут). Правка количества и удаление позиций; оформление —
// отдельный экран/задача (/checkout).
export function CartPage() {
  const { state, dispatch } = useCart();

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Link to="/" className="text-tg-link">
          ← Назад
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-tg-text">Корзина</h1>
      </header>

      <main className="p-4 pb-28">
        {state.items.length === 0 ? (
          <p className="py-16 text-center text-tg-hint">Корзина пуста.</p>
        ) : (
          <div className="space-y-3">
            {state.items.map((item) => (
              <div
                key={item.variantId}
                className="rounded-2xl bg-tg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-tg-text">
                      {item.productName}
                    </p>
                    <p className="text-sm text-tg-hint">{item.variantName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({ type: "remove", variantId: item.variantId })
                    }
                    className="shrink-0 text-sm text-tg-destructive"
                  >
                    Удалить
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Уменьшить количество"
                      onClick={() =>
                        dispatch({
                          type: "setQuantity",
                          variantId: item.variantId,
                          quantity: item.quantity - 1,
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-bg text-tg-text"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm tabular-nums text-tg-text">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="Увеличить количество"
                      disabled={item.stock !== null && item.quantity >= item.stock}
                      onClick={() =>
                        dispatch({
                          type: "setQuantity",
                          variantId: item.variantId,
                          quantity: item.quantity + 1,
                        })
                      }
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-bg text-tg-text disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-medium text-tg-text tabular-nums">
                    {formatPrice(item.priceKopecks * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {state.items.length > 0 && (
        <div className="tg-glass fixed inset-x-0 bottom-0 z-20 border-t border-tg-separator px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-tg-hint">Итого</span>
            <span className="text-lg font-semibold text-tg-text tabular-nums">
              {formatPrice(cartTotalKopecks(state))}
            </span>
          </div>
          <Link
            to="/checkout"
            className="block rounded-2xl bg-tg-accent py-3 text-center font-medium text-tg-accent-text"
          >
            Оформить заказ
          </Link>
        </div>
      )}
    </div>
  );
}

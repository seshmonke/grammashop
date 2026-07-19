import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { cartReducer, initialCartState, type CartAction, type CartState } from "./cart-reducer";

// Обёртка reducer'а в контекст (тот же приём, что и session-context.ts) —
// логика тестируется отдельно от React в cart-reducer.test.ts, здесь только
// диспатч. Состояние живёт в памяти вкладки, не в localStorage — заказ
// оформляется в рамках одной сессии ТМА, переживать перезагрузку незачем.
type CartContextValue = { state: CartState; dispatch: Dispatch<CartAction> };

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart использован вне CartProvider");
  }
  return ctx;
}

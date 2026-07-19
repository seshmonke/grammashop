// Корзина на клиенте — context + reducer (см. STACK.md#роутинг, карта
// экранов «витрина: каталог → карточка → корзина → чекаут»). Чистая логика
// вынесена из React (TDD, тот же приём, что и seller/variant-diff.ts) —
// компонент-обёртка в cart-context.tsx только диспатчит.

export type CartItem = {
  // Заказ оформляется одному продавцу (см. CONCEPT.md#каталог-и-заказы) —
  // sellerId на позиции нужен, чтобы reducer мог обнаружить смену магазина.
  sellerId: number;
  productId: number;
  variantId: number;
  productName: string;
  variantName: string;
  priceKopecks: number;
  // null — учёт остатка выключен (без верхней границы количества).
  stock: number | null;
  quantity: number;
};

export type CartState = {
  sellerId: number | null;
  items: CartItem[];
};

export type CartAction =
  | { type: "add"; item: Omit<CartItem, "quantity">; quantity?: number }
  | { type: "remove"; variantId: number }
  | { type: "setQuantity"; variantId: number; quantity: number }
  | { type: "clear" };

export const initialCartState: CartState = { sellerId: null, items: [] };

function clampToStock(quantity: number, stock: number | null): number {
  return stock === null ? quantity : Math.min(quantity, stock);
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const addQuantity = action.quantity ?? 1;
      // Товар другого продавца в непустой корзине — начинаем корзину заново,
      // а не смешиваем позиции двух магазинов в одном заказе.
      const items =
        state.sellerId !== null && state.sellerId !== action.item.sellerId
          ? []
          : state.items;

      const existing = items.find((i) => i.variantId === action.item.variantId);
      if (existing) {
        return {
          sellerId: action.item.sellerId,
          items: items.map((i) =>
            i.variantId === action.item.variantId
              ? { ...i, quantity: clampToStock(i.quantity + addQuantity, i.stock) }
              : i,
          ),
        };
      }
      return {
        sellerId: action.item.sellerId,
        items: [
          ...items,
          { ...action.item, quantity: clampToStock(addQuantity, action.item.stock) },
        ],
      };
    }

    case "remove":
      return {
        ...state,
        items: state.items.filter((i) => i.variantId !== action.variantId),
      };

    case "setQuantity": {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.variantId !== action.variantId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) =>
          i.variantId === action.variantId
            ? { ...i, quantity: clampToStock(action.quantity, i.stock) }
            : i,
        ),
      };
    }

    case "clear":
      return initialCartState;
  }
}

export function cartCount(state: CartState): number {
  return state.items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartTotalKopecks(state: CartState): number {
  return state.items.reduce((sum, i) => sum + i.priceKopecks * i.quantity, 0);
}

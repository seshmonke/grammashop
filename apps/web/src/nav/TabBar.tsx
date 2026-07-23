import type { ReactNode } from "react";
import { Store, ShoppingCart, ClipboardList } from "lucide-react";
import { useCart } from "../cart/cart-context";
import { cartCount } from "../cart/cart-reducer";
import { FloatingToolbar } from "./FloatingToolbar";

// Постоянная навигация витрины (см. DESIGN_SYSTEM.md#навигация--floating-toolbar).
// Рендерится только на корневых экранах раздела (StorefrontHome, CartPage) —
// на drill-down (ProductDetail, CheckoutPage) страницы её просто не
// подключают, отдельного скрытия по pathname не нужно.
export function TabBar({ above }: { above?: ReactNode }) {
  const { state } = useCart();
  const count = cartCount(state);

  return (
    <FloatingToolbar
      tabs={[
        { to: "/", label: "Каталог", icon: Store },
        { to: "/cart", label: "Корзина", icon: ShoppingCart, badge: count },
        { to: "/orders", label: "Заказы", icon: ClipboardList },
      ]}
      blobClassName="border border-ice-on-theme-toolbar/50 bg-ice-on-theme/15"
      activeTextClassName="text-ice-on-theme-toolbar"
      above={above}
    />
  );
}

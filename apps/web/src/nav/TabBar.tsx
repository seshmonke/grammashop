import { Link, useLocation } from "react-router-dom";
import { Store, ShoppingCart } from "lucide-react";
import { useCart } from "../cart/cart-context";
import { cartCount } from "../cart/cart-reducer";

// Постоянная навигация витрины (см. DESIGN_SYSTEM.md#навигация--bottom-tab-bar):
// паттерн из Apple HIG (структура/поведение), визуал — Y2K. Рендерится только
// на корневых экранах раздела (StorefrontHome, CartPage) — на drill-down
// (ProductDetail, CheckoutPage) страницы её просто не подключают, отдельного
// скрытия по pathname не нужно.
const TABS = [
  { to: "/", label: "Каталог", icon: Store },
  { to: "/cart", label: "Корзина", icon: ShoppingCart },
] as const;

export function TabBar() {
  const location = useLocation();
  const { state } = useCart();
  const count = cartCount(state);

  return (
    <nav
      aria-label="Основная навигация"
      className="tg-glass fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-around gap-1 rounded-2xl border border-tg-separator px-2 py-1 shadow-lg"
    >
      {TABS.map(({ to, label, icon: Icon }) => {
        const active = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-xs font-medium ${
              active ? "text-ice-on-theme" : "text-tg-hint"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
            {to === "/cart" && count > 0 && (
              <span className="absolute right-1/4 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ice-on-theme px-1 text-[10px] font-semibold tabular-nums text-white">
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

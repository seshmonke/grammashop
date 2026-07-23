import { createBrowserRouter } from "react-router-dom";
import { Landing } from "./auth/Landing";
import { RequireSeller, RequireAdmin } from "./auth/guards";
import { ProductDetail } from "./routes/storefront/ProductDetail";
import { CartPage } from "./routes/storefront/CartPage";
import { CheckoutPage } from "./routes/storefront/CheckoutPage";
import { OrdersPage } from "./routes/storefront/OrdersPage";
import { SellerHome } from "./routes/seller/SellerHome";
import { ProductForm } from "./routes/seller/ProductForm";
import { SellerOrders } from "./routes/seller/SellerOrders";
import { RegisterForm } from "./routes/seller/RegisterForm";
import { SellerProfile } from "./routes/seller/SellerProfile";
import { PlatformHome } from "./routes/platform/PlatformHome";

// Три группы маршрутов одного SPA (витрина/продавец/платформа), см.
// STACK.md#роутинг. Вход — `/` (Landing) решает по start_param и роли, куда
// направить. Продавцовская и платформенная админки закрыты гвардами по
// способностям сессии (AuthProvider выше по дереву уже её резолвнул).
export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  // Карточка товара витрины (seller_id — из start_param, как и каталог).
  { path: "/product/:productId", element: <ProductDetail /> },
  { path: "/cart", element: <CartPage /> },
  { path: "/checkout", element: <CheckoutPage /> },
  { path: "/orders", element: <OrdersPage /> },
  // Регистрация не под RequireSeller — у пользователя ещё нет продавца,
  // ровно её эта форма и создаёт (см. auth/Landing.tsx).
  { path: "/register", element: <RegisterForm /> },
  {
    path: "/seller",
    element: (
      <RequireSeller>
        <SellerHome />
      </RequireSeller>
    ),
  },
  {
    path: "/seller/profile",
    element: (
      <RequireSeller>
        <SellerProfile />
      </RequireSeller>
    ),
  },
  {
    path: "/seller/products/new",
    element: (
      <RequireSeller>
        <ProductForm />
      </RequireSeller>
    ),
  },
  {
    path: "/seller/products/:productId/edit",
    element: (
      <RequireSeller>
        <ProductForm />
      </RequireSeller>
    ),
  },
  {
    path: "/seller/orders",
    element: (
      <RequireSeller>
        <SellerOrders />
      </RequireSeller>
    ),
  },
  // Диплинк на конкретный заказ (start_param `o<orderId>`, Landing.tsx) —
  // тот же список, только со скроллом и подсветкой нужной карточки.
  {
    path: "/seller/orders/:orderId",
    element: (
      <RequireSeller>
        <SellerOrders />
      </RequireSeller>
    ),
  },
  {
    path: "/platform",
    element: (
      <RequireAdmin>
        <PlatformHome />
      </RequireAdmin>
    ),
  },
]);

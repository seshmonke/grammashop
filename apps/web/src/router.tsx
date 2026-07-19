import { createBrowserRouter } from "react-router-dom";
import { Landing } from "./auth/Landing";
import { RequireSeller, RequireAdmin } from "./auth/guards";
import { ProductDetail } from "./routes/storefront/ProductDetail";
import { SellerHome } from "./routes/seller/SellerHome";
import { ProductForm } from "./routes/seller/ProductForm";
import { PlatformHome } from "./routes/platform/PlatformHome";

// Три группы маршрутов одного SPA (витрина/продавец/платформа), см.
// STACK.md#роутинг. Вход — `/` (Landing) решает по start_param и роли, куда
// направить. Продавцовская и платформенная админки закрыты гвардами по
// способностям сессии (AuthProvider выше по дереву уже её резолвнул).
export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  // Карточка товара витрины (seller_id — из start_param, как и каталог).
  { path: "/product/:productId", element: <ProductDetail /> },
  {
    path: "/seller",
    element: (
      <RequireSeller>
        <SellerHome />
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
    path: "/platform",
    element: (
      <RequireAdmin>
        <PlatformHome />
      </RequireAdmin>
    ),
  },
]);

import { createBrowserRouter } from "react-router-dom";
import { StorefrontHome } from "./routes/storefront/StorefrontHome";
import { SellerHome } from "./routes/seller/SellerHome";
import { PlatformHome } from "./routes/platform/PlatformHome";

// Три группы маршрутов одного SPA (витрина/продавец/платформа), см.
// STACK.md#роутинг. Ограничение доступа по роли из сессии — задача
// авторизации на фронте, не в скоупе этого скелета.
export const router = createBrowserRouter([
  { path: "/", element: <StorefrontHome /> },
  { path: "/seller", element: <SellerHome /> },
  { path: "/platform", element: <PlatformHome /> },
]);

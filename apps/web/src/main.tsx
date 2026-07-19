import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { queryClient } from "./lib/query-client";
import { AuthProvider } from "./auth/AuthProvider";
import { initTelegram } from "./lib/telegram";
import { initSentry } from "./sentry";
import "./index.css";

initSentry();
initTelegram();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root element not found");
}

// Порядок оболочек: QueryClient (серверное состояние) → AuthProvider
// (резолвит сессию из initData до рендера маршрутов, чтобы гварды видели
// роль) → маршруты. AuthProvider держит загрузку/ошибку до готовности.
createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

import { authResponseSchema, type AuthResponse } from "@grammashop/shared";
import { apiClient } from "../lib/api-client";
import { resolveInitData } from "./init-data";

// Сессия = способности аккаунта из ответа /auth (токен + telegramId +
// sellerId + isAdmin), контракт общий с бэком (packages/shared).
export type Session = AuthResponse;

// Обмен initData на сессию (см. STACK.md#авторизация). Резолвит initData
// (реальный или dev-mock), шлёт на /auth, валидирует ответ общей схемой.
export async function authenticate(): Promise<Session> {
  const initData = resolveInitData();
  const { data } = await apiClient.post("/auth", { initData });
  return authResponseSchema.parse(data);
}

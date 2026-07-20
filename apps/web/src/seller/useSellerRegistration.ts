import { useMutation } from "@tanstack/react-query";
import {
  registerSellerResponseSchema,
  type RegisterSellerRequest,
  type RegisterSellerResponse,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// POST /seller/register (см. STACK.md#серверное-состояние). Успех меняет
// способности сессии (появляется sellerId) — компонент-потребитель
// перезапрашивает /auth полной перезагрузкой страницы, а не точечным
// обновлением кэша (см. RegisterForm.tsx).
export function useRegisterSeller() {
  return useMutation<RegisterSellerResponse, unknown, RegisterSellerRequest>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post("/seller/register", input);
      return registerSellerResponseSchema.parse(data);
    },
  });
}

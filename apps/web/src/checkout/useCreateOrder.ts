import { useMutation } from "@tanstack/react-query";
import {
  createOrderResponseSchema,
  type CreateOrderRequest,
  type CreateOrderResponse,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// POST /shop/:sellerId/orders (см. STACK.md#серверное-состояние: мутации —
// через TanStack Query, тот же приём, что и в продавцовской админке).
export function useCreateOrder(sellerId: number) {
  return useMutation<CreateOrderResponse, unknown, CreateOrderRequest>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post(`/shop/${sellerId}/orders`, input);
      return createOrderResponseSchema.parse(data);
    },
  });
}

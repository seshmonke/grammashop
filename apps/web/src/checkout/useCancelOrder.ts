import { useMutation, useQueryClient } from "@tanstack/react-query";
import { buyerOrderSchema, type BuyerOrder } from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// POST /shop/:sellerId/orders/:id/cancel — отмена заказа покупателем, пока
// он new (см. CONCEPT.md#каталог-и-заказы). Зеркало useUpdateOrderStatus в
// продавцовской админке: после успеха инвалидируем список «мои заказы»
// этого магазина целиком (тот же ключ, что useBuyerOrders), точечный патч
// кэша на масштабе Тарифа 1 не нужен.
export function useCancelOrder(sellerId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation<BuyerOrder, unknown, number>({
    mutationFn: async (orderId) => {
      const { data } = await apiClient.post(
        `/shop/${sellerId}/orders/${orderId}/cancel`,
      );
      return buyerOrderSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["buyer-orders", sellerId] });
    },
  });
}

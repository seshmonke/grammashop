import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sellerOrderListResponseSchema,
  sellerOrderSchema,
  type OrderStatus,
  type SellerOrder,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// Заказы в продавцовской админке (см. STACK.md#роутинг, Спринт 13). Тот же
// приём, что и useSellerProducts.ts — TanStack Query, инвалидация списка
// целиком после мутации (масштаб Тарифа 1 не требует точечного патча кэша).

const ORDERS_QUERY_KEY = ["seller-orders"];

export function useSellerOrders() {
  return useQuery<SellerOrder[]>({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get("/seller/orders");
      return sellerOrderListResponseSchema.parse(data).orders;
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; status: OrderStatus }) => {
      const { data } = await apiClient.patch(`/seller/orders/${args.id}/status`, {
        status: args.status,
      });
      return sellerOrderSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
    },
  });
}

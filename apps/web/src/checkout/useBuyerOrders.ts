import { useQuery } from "@tanstack/react-query";
import { buyerOrderListResponseSchema, type BuyerOrder } from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// «Мои заказы» покупателя (GET /orders/mine, Спринт 34) — сквозной список по
// всем магазинам платформы, тот же приём TanStack Query, что и
// useSellerOrders.ts.

export function useBuyerOrders() {
  return useQuery<BuyerOrder[]>({
    queryKey: ["buyer-orders"],
    queryFn: async () => {
      const { data } = await apiClient.get("/orders/mine");
      return buyerOrderListResponseSchema.parse(data).orders;
    },
  });
}

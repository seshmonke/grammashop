import { useQuery } from "@tanstack/react-query";
import { buyerOrderListResponseSchema, type BuyerOrder } from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// «Мои заказы» покупателя в текущем магазине (GET /shop/:sellerId/orders/mine).
// Пересматривает Спринт 34 — список был сквозным по всем магазинам платформы,
// сужен до магазина, в который зашёл покупатель по диплинку (Спринт 40,
// сквозной список убран целиком). sellerId — из start_param, тот же приём
// (проброс параметром, не resolveSellerId() внутри хука), что и
// useShopCatalog.ts; enabled: ждём seller_id, без него запрос не шлём.
export function useBuyerOrders(sellerId: number | undefined) {
  return useQuery<BuyerOrder[]>({
    queryKey: ["buyer-orders", sellerId],
    enabled: sellerId != null,
    queryFn: async () => {
      const { data } = await apiClient.get(`/shop/${sellerId}/orders/mine`);
      return buyerOrderListResponseSchema.parse(data).orders;
    },
  });
}

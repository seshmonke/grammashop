import { useQuery } from "@tanstack/react-query";
import {
  shopCatalogResponseSchema,
  type ShopCatalogResponse,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// Каталог витрины по seller_id (GET /shop/:sellerId). Серверное состояние —
// через TanStack Query (см. STACK.md#серверное-состояние). enabled: ждём
// seller_id (из start_param); без него запрос не шлём.
export function useShopCatalog(sellerId: number | undefined) {
  return useQuery<ShopCatalogResponse>({
    queryKey: ["shop", sellerId],
    enabled: sellerId != null,
    queryFn: async () => {
      const { data } = await apiClient.get(`/shop/${sellerId}`);
      return shopCatalogResponseSchema.parse(data);
    },
  });
}

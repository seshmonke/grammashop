import { useQuery } from "@tanstack/react-query";
import {
  checkoutPrefillResponseSchema,
  type CheckoutPrefill,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// GET /shop/:sellerId/orders/prefill — автоподстановка чекаута из
// последнего заказа покупателя в этом магазине (см.
// CONCEPT.md#жизненный-цикл-сущностей). Отдаёт снапшот собственных ПДн
// покупателя или null, если заказов ещё не было. enabled по sellerId — без
// магазина запрос не имеет смысла. Тихий фейл: prefill — удобство, а не
// обязательное условие оформления, поэтому ошибку не показываем (форма
// просто останется пустой).
export function useCheckoutPrefill(sellerId: number | null) {
  return useQuery<CheckoutPrefill | null>({
    queryKey: ["checkout-prefill", sellerId],
    enabled: sellerId != null && sellerId > 0,
    queryFn: async () => {
      const { data } = await apiClient.get(`/shop/${sellerId}/orders/prefill`);
      return checkoutPrefillResponseSchema.parse(data).prefill;
    },
  });
}

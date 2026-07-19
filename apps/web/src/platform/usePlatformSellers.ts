import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  platformSellerListResponseSchema,
  updateSellerStatusResponseSchema,
  type PlatformSeller,
  type SellerStatus,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// Список продавцов в платформенной админке (см. STACK.md#роутинг, Спринт
// 14). Тот же приём, что и seller/useSellerOrders.ts — TanStack Query,
// инвалидация списка целиком после мутации.

const PLATFORM_SELLERS_QUERY_KEY = ["platform-sellers"];

export function usePlatformSellers() {
  return useQuery<PlatformSeller[]>({
    queryKey: PLATFORM_SELLERS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get("/platform/sellers");
      return platformSellerListResponseSchema.parse(data).sellers;
    },
  });
}

export function useUpdateSellerStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; status: SellerStatus }) => {
      const { data } = await apiClient.patch(
        `/platform/sellers/${args.id}/status`,
        { status: args.status },
      );
      return updateSellerStatusResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_SELLERS_QUERY_KEY });
    },
  });
}

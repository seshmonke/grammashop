import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  grantGraceResponseSchema,
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
    mutationFn: async (args: {
      id: number;
      status: SellerStatus;
      reason?: string;
    }) => {
      const { data } = await apiClient.patch(
        `/platform/sellers/${args.id}/status`,
        { status: args.status, reason: args.reason },
      );
      return updateSellerStatusResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_SELLERS_QUERY_KEY });
    },
  });
}

export function useGrantGrace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; months: number }) => {
      const { data } = await apiClient.patch(
        `/platform/sellers/${args.id}/grace`,
        { months: args.months },
      );
      return grantGraceResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PLATFORM_SELLERS_QUERY_KEY });
    },
  });
}

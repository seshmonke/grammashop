import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sellerProfileSchema,
  type SellerProfile,
  type UpdateSellerProfileRequest,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// GET/PATCH /seller/profile (см. STACK.md#серверное-состояние, Спринт 21) —
// тот же приём, что и useSellerProducts.ts.

const PROFILE_QUERY_KEY = ["seller-profile"];

export function useSellerProfile() {
  return useQuery<SellerProfile>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get("/seller/profile");
      return sellerProfileSchema.parse(data);
    },
  });
}

export function useUpdateSellerProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateSellerProfileRequest) => {
      const { data } = await apiClient.patch("/seller/profile", input);
      return sellerProfileSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
}

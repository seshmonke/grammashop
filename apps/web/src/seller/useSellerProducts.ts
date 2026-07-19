import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  sellerProductListResponseSchema,
  sellerProductSchema,
  type CreateProductRequest,
  type ProductVariantInput,
  type ProductVariantUpdate,
  type SellerProduct,
  type UpdateProductRequest,
} from "@grammashop/shared";
import { apiClient } from "../lib/api-client";

// Продавцовская админка товаров (CRUD, см. STACK.md#роутинг). Серверное
// состояние — через TanStack Query (см. STACK.md#серверное-состояние),
// как и в витрине (useShopCatalog). Каждая мутация инвалидирует общий
// список — на масштабе Тарифа 1 (≤30 карточек) точечный патч кэша не
// стоит сложности.

const PRODUCTS_QUERY_KEY = ["seller-products"];

export function useSellerProducts() {
  return useQuery<SellerProduct[]>({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get("/seller/products");
      return sellerProductListResponseSchema.parse(data).products;
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProductRequest) => {
      const { data } = await apiClient.post("/seller/products", input);
      return sellerProductSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; input: UpdateProductRequest }) => {
      const { data } = await apiClient.patch(
        `/seller/products/${args.id}`,
        args.input,
      );
      return sellerProductSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/seller/products/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useAddVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: number; input: ProductVariantInput }) => {
      const { data } = await apiClient.post(
        `/seller/products/${args.productId}/variants`,
        args.input,
      );
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      productId: number;
      variantId: number;
      input: ProductVariantUpdate;
    }) => {
      const { data } = await apiClient.patch(
        `/seller/products/${args.productId}/variants/${args.variantId}`,
        args.input,
      );
      return data as { id: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: number; variantId: number }) => {
      await apiClient.delete(
        `/seller/products/${args.productId}/variants/${args.variantId}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

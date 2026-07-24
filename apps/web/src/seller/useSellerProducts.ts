import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  productImagesResponseSchema,
  productImportResponseSchema,
  publishAllResponseSchema,
  sellerProductListResponseSchema,
  sellerProductSchema,
  type CreateProductRequest,
  type ProductImportResponse,
  type ProductStatus,
  type ProductVariantInput,
  type ProductVariantUpdate,
  type PublishAllResponse,
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

// Публикация/снятие карточки (active↔hidden, см.
// CONCEPT.md#жизненный-цикл-сущностей). Отдельный эндпоинт от общего
// обновления карточки — у него своя проверка (≥1 варианта) на бэке.
export function useSetProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; status: ProductStatus }) => {
      const { data } = await apiClient.patch(
        `/seller/products/${args.id}/status`,
        { status: args.status },
      );
      return sellerProductSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

// Массовая публикация черновиков — закрывает онбординг после пакетного
// импорта (см. CONCEPT.md#жизненный-цикл-сущностей).
export function usePublishAllDrafts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PublishAllResponse> => {
      const { data } = await apiClient.post("/seller/products/publish-all");
      return publishAllResponseSchema.parse(data);
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

// Галерея фото — отдельные запросы от остального CRUD карточки: файл идёт
// multipart, не JSON-телом (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20). До 5
// фото на карточку, добавление не заменяет прежние.
export function useAddProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: number; file: File }) => {
      const formData = new FormData();
      formData.append("file", args.file);
      const { data } = await apiClient.post(
        `/seller/products/${args.productId}/images`,
        formData,
      );
      return productImagesResponseSchema.parse(data).images;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useMoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      productId: number;
      imageId: number;
      direction: "left" | "right";
    }) => {
      const { data } = await apiClient.patch(
        `/seller/products/${args.productId}/images/${args.imageId}/move`,
        { direction: args.direction },
      );
      return productImagesResponseSchema.parse(data).images;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

// Пакетная заливка каталога Excel-шаблоном (см.
// STACK.md#пакетная-заливка-каталога-спринт-18) — partial-успех, ответ
// содержит и созданное количество, и построчные ошибки, поэтому не
// бросает при непустом errors (это не сетевая ошибка запроса).
export function useImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<ProductImportResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await apiClient.post("/seller/products/import", formData);
      return productImportResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

export function useDeleteProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { productId: number; imageId: number }) => {
      await apiClient.delete(
        `/seller/products/${args.productId}/images/${args.imageId}`,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY });
    },
  });
}

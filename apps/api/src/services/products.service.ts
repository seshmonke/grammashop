import { and, asc, count, eq } from "drizzle-orm";
import type {
  CreateProductRequest,
  ProductVariantInput,
  ProductVariantUpdate,
  SellerProduct,
  UpdateProductRequest,
} from "@grammashop/shared";
import { db } from "../db/client.js";
import { products, productVariants } from "../db/schema.js";

// Продавцовская админка товаров (CRUD, см. STACK.md#роутинг). Лимиты
// тарифа считаются здесь, не в БД-констрейнтах (ревью, задача Спринта 11):
// 30 карточек и 10 вариантов на карточку — рабочий ориентир Тарифа 1, v1
// не знает других тарифов (см. CONCEPT.md#скоуп-v1-mvp).
const MAX_PRODUCTS_PER_SELLER = 30;
const MAX_VARIANTS_PER_PRODUCT = 10;

function toSellerProduct(
  product: { id: number; name: string; description: string | null },
  variants: Array<{
    id: number;
    name: string;
    priceKopecks: number;
    oldPriceKopecks: number | null;
    stock: number | null;
  }>,
): SellerProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    variants,
  };
}

async function loadVariants(productId: number) {
  return db
    .select({
      id: productVariants.id,
      name: productVariants.name,
      priceKopecks: productVariants.priceKopecks,
      oldPriceKopecks: productVariants.oldPriceKopecks,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sortPosition), asc(productVariants.id));
}

export async function listSellerProducts(
  sellerId: number,
): Promise<SellerProduct[]> {
  const own = await db
    .select({ id: products.id, name: products.name, description: products.description })
    .from(products)
    .where(eq(products.sellerId, sellerId))
    .orderBy(asc(products.sortPosition), asc(products.id));

  return Promise.all(
    own.map(async (p) => toSellerProduct(p, await loadVariants(p.id))),
  );
}

// null — карточка не найдена или принадлежит другому продавцу; ownership
// всегда проверяется через sellerId, не только через id, чтобы один запрос
// не давал утечки существования чужих карточек по таймингу/поведению.
async function findOwnedProduct(sellerId: number, productId: number) {
  const [product] = await db
    .select({ id: products.id, name: products.name, description: products.description })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.sellerId, sellerId)));
  return product ?? null;
}

export async function createProduct(
  sellerId: number,
  input: CreateProductRequest,
): Promise<{ ok: true; product: SellerProduct } | { ok: false; reason: "product_limit" }> {
  const [productCountRow] = await db
    .select({ value: count() })
    .from(products)
    .where(eq(products.sellerId, sellerId));
  const existingCount = productCountRow?.value ?? 0;
  if (existingCount >= MAX_PRODUCTS_PER_SELLER) {
    return { ok: false, reason: "product_limit" };
  }

  const [product] = await db
    .insert(products)
    .values({
      sellerId,
      name: input.name,
      description: input.description ?? null,
    })
    .returning({ id: products.id, name: products.name, description: products.description });

  const insertedVariants = await db
    .insert(productVariants)
    .values(
      input.variants.map((v: ProductVariantInput) => ({
        productId: product!.id,
        name: v.name,
        priceKopecks: v.priceKopecks,
        oldPriceKopecks: v.oldPriceKopecks ?? null,
        stock: v.stock ?? null,
      })),
    )
    .returning({
      id: productVariants.id,
      name: productVariants.name,
      priceKopecks: productVariants.priceKopecks,
      oldPriceKopecks: productVariants.oldPriceKopecks,
      stock: productVariants.stock,
    });

  return { ok: true, product: toSellerProduct(product!, insertedVariants) };
}

export async function updateProduct(
  sellerId: number,
  productId: number,
  input: UpdateProductRequest,
): Promise<SellerProduct | null> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return null;

  const [updated] = await db
    .update(products)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
    })
    .where(eq(products.id, productId))
    .returning({ id: products.id, name: products.name, description: products.description });

  return toSellerProduct(updated!, await loadVariants(productId));
}

// false — карточка не найдена/чужая. Варианты удаляются каскадом на
// уровне FK (onDelete: cascade, см. db/schema.ts), отдельный DELETE не
// нужен.
export async function deleteProduct(
  sellerId: number,
  productId: number,
): Promise<boolean> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return false;
  await db.delete(products).where(eq(products.id, productId));
  return true;
}

export async function addVariant(
  sellerId: number,
  productId: number,
  input: ProductVariantInput,
): Promise<
  | { ok: true; variant: SellerProduct["variants"][number] }
  | { ok: false; reason: "not_found" | "variant_limit" }
> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const [variantCountRow] = await db
    .select({ value: count() })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const existingCount = variantCountRow?.value ?? 0;
  if (existingCount >= MAX_VARIANTS_PER_PRODUCT) {
    return { ok: false, reason: "variant_limit" };
  }

  const [variant] = await db
    .insert(productVariants)
    .values({
      productId,
      name: input.name,
      priceKopecks: input.priceKopecks,
      oldPriceKopecks: input.oldPriceKopecks ?? null,
      stock: input.stock ?? null,
    })
    .returning({
      id: productVariants.id,
      name: productVariants.name,
      priceKopecks: productVariants.priceKopecks,
      oldPriceKopecks: productVariants.oldPriceKopecks,
      stock: productVariants.stock,
    });

  return { ok: true, variant: variant! };
}

export async function updateVariant(
  sellerId: number,
  productId: number,
  variantId: number,
  input: ProductVariantUpdate,
): Promise<SellerProduct["variants"][number] | null> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return null;

  const [variant] = await db
    .update(productVariants)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priceKopecks !== undefined
        ? { priceKopecks: input.priceKopecks }
        : {}),
      ...(input.oldPriceKopecks !== undefined
        ? { oldPriceKopecks: input.oldPriceKopecks }
        : {}),
      ...(input.stock !== undefined ? { stock: input.stock } : {}),
    })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    )
    .returning({
      id: productVariants.id,
      name: productVariants.name,
      priceKopecks: productVariants.priceKopecks,
      oldPriceKopecks: productVariants.oldPriceKopecks,
      stock: productVariants.stock,
    });

  return variant ?? null;
}

// Карточка без опций хранится как единственный вариант по умолчанию (см.
// CONCEPT.md#каталог-и-заказы) — удаление последнего варианта карточки
// оставило бы её без цены, поэтому запрещено.
export async function deleteVariant(
  sellerId: number,
  productId: number,
  variantId: number,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "last_variant" }> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.productId, productId),
      ),
    );
  if (!variant) return { ok: false, reason: "not_found" };

  const [variantCountRow] = await db
    .select({ value: count() })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  const existingCount = variantCountRow?.value ?? 0;

  if (existingCount <= 1) {
    return { ok: false, reason: "last_variant" };
  }

  await db.delete(productVariants).where(eq(productVariants.id, variantId));
  return { ok: true };
}

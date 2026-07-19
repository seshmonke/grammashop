import type {
  ProductVariantInput,
  ProductVariantUpdate,
  SellerProductVariant,
} from "@grammashop/shared";

// Строка формы редактирования: новая — без id, существующая — с id
// исходного варианта.
export type VariantFormRow = ProductVariantInput & { id?: number };

const FIELDS = ["name", "priceKopecks", "oldPriceKopecks", "stock"] as const;

function normalize(field: (typeof FIELDS)[number], value: unknown) {
  // Форма может не проставить null явно для необязательных полей —
  // приравниваем undefined к null, иначе диф решит, что поле изменилось.
  if (field === "oldPriceKopecks" || field === "stock") {
    return value ?? null;
  }
  return value;
}

// Единственный источник правды о том, какие мутации (add/update/delete)
// нужны, чтобы серверное состояние совпало с формой — сами эндпоинты
// принимают только по одному варианту за раз (см. STACK.md#роутинг).
export function diffVariants(
  original: SellerProductVariant[],
  edited: VariantFormRow[],
): {
  toCreate: ProductVariantInput[];
  toUpdate: Array<{ variantId: number; input: ProductVariantUpdate }>;
  toDelete: number[];
} {
  const originalById = new Map(original.map((v) => [v.id, v]));
  const editedIds = new Set(
    edited.filter((r) => r.id != null).map((r) => r.id!),
  );

  const toCreate: ProductVariantInput[] = [];
  const toUpdate: Array<{ variantId: number; input: ProductVariantUpdate }> =
    [];

  for (const row of edited) {
    if (row.id == null) {
      const { id: _id, ...input } = row;
      toCreate.push(input);
      continue;
    }
    const before = originalById.get(row.id);
    if (!before) continue;

    const changed: ProductVariantUpdate = {};
    for (const field of FIELDS) {
      if (normalize(field, row[field]) !== normalize(field, before[field])) {
        (changed as Record<string, unknown>)[field] = row[field];
      }
    }
    if (Object.keys(changed).length > 0) {
      toUpdate.push({ variantId: row.id, input: changed });
    }
  }

  const toDelete = original
    .map((v) => v.id)
    .filter((id) => !editedIds.has(id));

  return { toCreate, toUpdate, toDelete };
}

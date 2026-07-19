import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { rublesToKopecks, kopecksToRubles } from "../../lib/money";
import { diffVariants, type VariantFormRow } from "../../seller/variant-diff";
import {
  useAddVariant,
  useCreateProduct,
  useDeleteVariant,
  useSellerProducts,
  useUpdateProduct,
  useUpdateVariant,
} from "../../seller/useSellerProducts";

// Форма продавцовской админки товаров: одна форма и на создание, и на
// редактирование карточки (см. STACK.md#роутинг). Фото не заводим — вне
// скоупа Спринта 11 (пайплайн изображений спроектирован отдельно).

const MAX_VARIANTS = 10;

type DraftVariant = {
  id?: number;
  name: string;
  priceRub: string;
  oldPriceRub: string;
  stock: string;
};

function emptyDraftVariant(): DraftVariant {
  return { name: "", priceRub: "", oldPriceRub: "", stock: "" };
}

function toDraftVariant(v: {
  id: number;
  name: string;
  priceKopecks: number;
  oldPriceKopecks: number | null;
  stock: number | null;
}): DraftVariant {
  return {
    id: v.id,
    name: v.name,
    priceRub: String(kopecksToRubles(v.priceKopecks)),
    oldPriceRub:
      v.oldPriceKopecks != null ? String(kopecksToRubles(v.oldPriceKopecks)) : "",
    stock: v.stock != null ? String(v.stock) : "",
  };
}

function parseDraftVariant(d: DraftVariant): VariantFormRow | null {
  const priceRub = Number(d.priceRub);
  if (!d.name.trim() || !Number.isFinite(priceRub) || priceRub <= 0) {
    return null;
  }
  const oldPriceRub = d.oldPriceRub.trim() === "" ? null : Number(d.oldPriceRub);
  const stock = d.stock.trim() === "" ? null : Number(d.stock);
  return {
    ...(d.id != null ? { id: d.id } : {}),
    name: d.name.trim(),
    priceKopecks: rublesToKopecks(priceRub),
    oldPriceKopecks:
      oldPriceRub != null && Number.isFinite(oldPriceRub)
        ? rublesToKopecks(oldPriceRub)
        : null,
    stock: stock != null && Number.isFinite(stock) ? Math.trunc(stock) : null,
  };
}

export function ProductForm() {
  const { productId } = useParams();
  const isEdit = productId != null;
  const navigate = useNavigate();

  const { data: products } = useSellerProducts();
  const existing = isEdit
    ? products?.find((p) => String(p.id) === productId)
    : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [variants, setVariants] = useState<DraftVariant[]>(
    existing ? existing.variants.map(toDraftVariant) : [emptyDraftVariant()],
  );
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!isEdit);

  // existing появляется асинхронно (список ещё грузится) — заполняем форму
  // один раз, когда данные подъехали, не перетирая правки пользователя.
  if (isEdit && !loaded && existing) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setVariants(existing.variants.map(toDraftVariant));
    setLoaded(true);
  }

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const addVariant = useAddVariant();
  const updateVariant = useUpdateVariant();
  const deleteVariant = useDeleteVariant();

  const saving =
    createProduct.isPending ||
    updateProduct.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    deleteVariant.isPending;

  function updateVariantField(
    index: number,
    field: keyof DraftVariant,
    value: string,
  ) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  }

  function addVariantRow() {
    if (variants.length >= MAX_VARIANTS) return;
    setVariants((prev) => [...prev, emptyDraftVariant()]);
  }

  function removeVariantRow(index: number) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Укажите название товара");
      return;
    }
    const parsedVariants = variants.map(parseDraftVariant);
    if (parsedVariants.some((v) => v === null)) {
      setError("У каждого варианта должны быть название и цена больше нуля");
      return;
    }
    const validVariants = parsedVariants as VariantFormRow[];

    try {
      if (!isEdit) {
        await createProduct.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          variants: validVariants,
        });
      } else {
        const id = Number(productId);
        await updateProduct.mutateAsync({
          id,
          input: { name: name.trim(), description: description.trim() || null },
        });

        const diff = diffVariants(existing?.variants ?? [], validVariants);
        for (const input of diff.toCreate) {
          await addVariant.mutateAsync({ productId: id, input });
        }
        for (const { variantId, input } of diff.toUpdate) {
          await updateVariant.mutateAsync({ productId: id, variantId, input });
        }
        for (const variantId of diff.toDelete) {
          await deleteVariant.mutateAsync({ productId: id, variantId });
        }
      }
      navigate("/seller");
    } catch {
      setError("Не удалось сохранить товар — попробуйте ещё раз");
    }
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="text-lg font-semibold text-tg-text">
          {isEdit ? "Изменить товар" : "Новый товар"}
        </h1>
      </header>

      <main className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="name">
              Название
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-tg-hint"
              htmlFor="description"
            >
              Описание
            </label>
            <textarea
              id="description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-tg-hint">
                Варианты (размер/цвет и т.п.)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addVariantRow}
                disabled={variants.length >= MAX_VARIANTS}
              >
                Добавить вариант
              </Button>
            </div>

            <div className="space-y-3">
              {variants.map((v, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-tg-separator p-3"
                >
                  <input
                    placeholder="Название варианта"
                    value={v.name}
                    onChange={(e) =>
                      updateVariantField(i, "name", e.target.value)
                    }
                    className="col-span-2 rounded-md border border-tg-separator bg-tg-surface px-2 py-1.5 text-sm text-tg-text"
                  />
                  <input
                    placeholder="Цена, ₽"
                    inputMode="decimal"
                    value={v.priceRub}
                    onChange={(e) =>
                      updateVariantField(i, "priceRub", e.target.value)
                    }
                    className="rounded-md border border-tg-separator bg-tg-surface px-2 py-1.5 text-sm text-tg-text"
                  />
                  <input
                    placeholder="Старая цена, ₽"
                    inputMode="decimal"
                    value={v.oldPriceRub}
                    onChange={(e) =>
                      updateVariantField(i, "oldPriceRub", e.target.value)
                    }
                    className="rounded-md border border-tg-separator bg-tg-surface px-2 py-1.5 text-sm text-tg-text"
                  />
                  <input
                    placeholder="Остаток (пусто — не считаем)"
                    inputMode="numeric"
                    value={v.stock}
                    onChange={(e) =>
                      updateVariantField(i, "stock", e.target.value)
                    }
                    className="col-span-2 rounded-md border border-tg-separator bg-tg-surface px-2 py-1.5 text-sm text-tg-text"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariantRow(i)}
                    disabled={variants.length <= 1}
                    className="col-span-2 text-left text-sm text-tg-destructive disabled:opacity-40"
                  >
                    Убрать вариант
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-tg-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/seller")}
            >
              Отмена
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

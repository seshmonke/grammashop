import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { fieldBorderClass } from "../../lib/field-styles";
import { rublesToKopecks, kopecksToRubles } from "../../lib/money";
import { ScreenState } from "../../shop/ScreenState";
import { diffVariants, type VariantFormRow } from "../../seller/variant-diff";
import {
  useAddProductImage,
  useAddVariant,
  useCreateProduct,
  useDeleteProductImage,
  useDeleteVariant,
  useMoveProductImage,
  useSellerProducts,
  useUpdateProduct,
  useUpdateVariant,
} from "../../seller/useSellerProducts";

// Форма продавцовской админки товаров: одна форма и на создание, и на
// редактирование карточки (см. STACK.md#роутинг). Фото — отдельные запросы
// от остального CRUD (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20), поэтому
// галерея доступна только для уже созданной карточки (isEdit) — для новой
// сначала нужен id, который выдаёт только успешное создание.

const MAX_VARIANTS = 10;
const MAX_IMAGES = 5;

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

type VariantFieldErrors = Partial<Record<keyof DraftVariant, string>>;

// Блюр-валидация варианта (канон — см. docs/design/DESIGN_SYSTEM.md#формы):
// та же логика допустимости, что и в parseDraftVariant/API-схеме
// (packages/shared/src/schemas/products.ts), но с ошибкой на конкретное
// поле вместо общего «невалидно».
function variantErrors(d: DraftVariant): VariantFieldErrors {
  const errors: VariantFieldErrors = {};
  if (!d.name.trim()) errors.name = "Укажите название варианта";

  const price = Number(d.priceRub);
  if (d.priceRub.trim() === "") {
    errors.priceRub = "Укажите цену";
  } else if (!Number.isFinite(price) || price <= 0) {
    errors.priceRub = "Цена должна быть больше нуля";
  }

  if (d.oldPriceRub.trim() !== "") {
    const oldPrice = Number(d.oldPriceRub);
    if (!Number.isFinite(oldPrice) || oldPrice <= 0) {
      errors.oldPriceRub = "Введите корректную цену";
    } else if (Number.isFinite(price) && price > 0 && oldPrice < price) {
      errors.oldPriceRub = "Базовая цена не может быть ниже цены со скидкой";
    }
  }

  if (d.stock.trim() !== "") {
    const stock = Number(d.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      errors.stock = "Остаток не может быть отрицательным";
    }
  }

  return errors;
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

  const { data: products, isLoading: productsLoading } = useSellerProducts();
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
  const [nameTouched, setNameTouched] = useState(false);
  const [variantTouched, setVariantTouched] = useState<
    Record<number, Partial<Record<keyof DraftVariant, boolean>>>
  >({});

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
  const addImage = useAddProductImage();
  const deleteImage = useDeleteProductImage();
  const moveImage = useMoveProductImage();
  const [imageError, setImageError] = useState<string | null>(null);
  const [movingImageId, setMovingImageId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saving =
    createProduct.isPending ||
    updateProduct.isPending ||
    addVariant.isPending ||
    updateVariant.isPending ||
    deleteVariant.isPending;

  if (isEdit && !existing) {
    return (
      <div className="min-h-dvh bg-tg-bg">
        {productsLoading ? (
          <ScreenState variant="full" title="Загрузка…" />
        ) : (
          <ScreenState
            variant="full"
            title="Товар не найден"
            action={{ to: "/seller", label: "К товарам" }}
          />
        )}
      </div>
    );
  }

  function updateVariantField(
    index: number,
    field: keyof DraftVariant,
    value: string,
  ) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    );
  }

  function touchVariantField(index: number, field: keyof DraftVariant) {
    setVariantTouched((prev) => ({
      ...prev,
      [index]: { ...prev[index], [field]: true },
    }));
  }

  function addVariantRow() {
    if (variants.length >= MAX_VARIANTS) return;
    setVariants((prev) => [...prev, emptyDraftVariant()]);
  }

  function removeVariantRow(index: number) {
    if (variants.length <= 1) return;
    setVariants((prev) => prev.filter((_, i) => i !== index));
    setVariantTouched((prev) => {
      const next: typeof prev = {};
      for (const [key, value] of Object.entries(prev)) {
        const i = Number(key);
        if (i < index) next[i] = value;
        else if (i > index) next[i - 1] = value;
      }
      return next;
    });
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !existing) return;

    setImageError(null);
    try {
      await addImage.mutateAsync({ productId: existing.id, file });
    } catch {
      setImageError("Не удалось загрузить фото — попробуйте другой файл");
    }
  }

  async function handlePhotoDelete(imageId: number) {
    if (!existing) return;
    if (!confirm("Удалить фото? Это действие необратимо.")) return;
    setImageError(null);
    try {
      await deleteImage.mutateAsync({ productId: existing.id, imageId });
    } catch {
      setImageError("Не удалось удалить фото — попробуйте ещё раз");
    }
  }

  async function handlePhotoMove(imageId: number, direction: "left" | "right") {
    if (!existing) return;
    setImageError(null);
    setMovingImageId(imageId);
    try {
      await moveImage.mutateAsync({ productId: existing.id, imageId, direction });
    } catch {
      setImageError("Не удалось переставить фото — попробуйте ещё раз");
    } finally {
      setMovingImageId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const hasNameError = !name.trim();
    const perVariantErrors = variants.map(variantErrors);
    if (hasNameError || perVariantErrors.some((e) => Object.keys(e).length > 0)) {
      setNameTouched(true);
      setVariantTouched(
        Object.fromEntries(
          variants.map((_, i) => [
            i,
            { name: true, priceRub: true, oldPriceRub: true, stock: true },
          ]),
        ),
      );
      return;
    }
    const validVariants = variants.map(parseDraftVariant) as VariantFormRow[];

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
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+var(--tg-header-safe-top))]">
        <Button asChild variant="outline" size="sm">
          <Link to="/seller">Товары</Link>
        </Button>
        <h1 className="mt-1 y2k-heading font-display text-lg text-tg-text">
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
              onBlur={() => setNameTouched(true)}
              aria-invalid={nameTouched && !name.trim() ? true : undefined}
              aria-describedby={!name.trim() ? "name-error" : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(nameTouched, !name.trim())}`}
            />
            {nameTouched && !name.trim() && (
              <p id="name-error" className="mt-1 text-sm text-tg-destructive">
                Укажите название товара
              </p>
            )}
          </div>

          <div>
            <label
              className="mb-1 block text-sm text-tg-hint"
              htmlFor="description"
            >
              Описание (необязательно)
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
            <span className="mb-1 block text-sm text-tg-hint">
              Фото ({existing ? existing.images.length : 0}/{MAX_IMAGES})
            </span>
            {!existing ? (
              <p className="text-sm text-tg-hint">
                Фото можно добавить после сохранения карточки.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {existing.images.map((image, i) => (
                  <div
                    key={image.id}
                    className="flex w-20 flex-col items-center gap-1"
                  >
                    <div className="h-20 w-20 overflow-hidden rounded-lg border border-tg-separator bg-tg-surface">
                      <img
                        src={image.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Сдвинуть влево"
                        disabled={i === 0 || movingImageId != null}
                        onClick={() => handlePhotoMove(image.id, "left")}
                        className="text-sm text-tg-text disabled:opacity-30"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        aria-label="Удалить фото"
                        disabled={deleteImage.isPending}
                        onClick={() => handlePhotoDelete(image.id)}
                        className="text-sm text-tg-text disabled:opacity-40"
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        aria-label="Сдвинуть вправо"
                        disabled={
                          i === existing.images.length - 1 || movingImageId != null
                        }
                        onClick={() => handlePhotoMove(image.id, "right")}
                        className="text-sm text-tg-text disabled:opacity-30"
                      >
                        →
                      </button>
                    </div>
                  </div>
                ))}

                {existing.images.length < MAX_IMAGES && (
                  <div className="flex h-20 w-20 items-center justify-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handlePhotoSelected}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={addImage.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {addImage.isPending ? "…" : "+ Фото"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            {imageError && (
              <p className="mt-1 text-sm text-tg-destructive">{imageError}</p>
            )}
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
              {variants.map((v, i) => {
                const vErrors = variantErrors(v);
                const vTouched = variantTouched[i] ?? {};
                return (
                  <div
                    key={i}
                    className="space-y-2 rounded-lg border border-tg-separator p-3"
                  >
                    <div>
                      <label
                        className="mb-1 block text-xs text-tg-hint"
                        htmlFor={`variant-${i}-name`}
                      >
                        Название варианта
                      </label>
                      <input
                        id={`variant-${i}-name`}
                        value={v.name}
                        onChange={(e) =>
                          updateVariantField(i, "name", e.target.value)
                        }
                        onBlur={() => touchVariantField(i, "name")}
                        aria-invalid={vTouched.name && vErrors.name ? true : undefined}
                        className={`w-full rounded-md border bg-tg-surface px-2 py-1.5 text-sm text-tg-text ${fieldBorderClass(!!vTouched.name, !!vErrors.name)}`}
                      />
                      {vTouched.name && vErrors.name && (
                        <p className="mt-1 text-xs text-tg-destructive">{vErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label
                        className="mb-1 block text-xs text-tg-hint"
                        htmlFor={`variant-${i}-price`}
                      >
                        Цена со скидкой, ₽
                      </label>
                      <input
                        id={`variant-${i}-price`}
                        inputMode="decimal"
                        value={v.priceRub}
                        onChange={(e) =>
                          updateVariantField(i, "priceRub", e.target.value)
                        }
                        onBlur={() => touchVariantField(i, "priceRub")}
                        aria-invalid={vTouched.priceRub && vErrors.priceRub ? true : undefined}
                        className={`w-full rounded-md border bg-tg-surface px-2 py-1.5 text-sm text-tg-text ${fieldBorderClass(!!vTouched.priceRub, !!vErrors.priceRub)}`}
                      />
                      {vTouched.priceRub && vErrors.priceRub && (
                        <p className="mt-1 text-xs text-tg-destructive">{vErrors.priceRub}</p>
                      )}
                    </div>

                    <div>
                      <label
                        className="mb-1 block text-xs text-tg-hint"
                        htmlFor={`variant-${i}-old-price`}
                      >
                        Базовая цена, ₽ (необязательно)
                      </label>
                      <input
                        id={`variant-${i}-old-price`}
                        inputMode="decimal"
                        value={v.oldPriceRub}
                        onChange={(e) =>
                          updateVariantField(i, "oldPriceRub", e.target.value)
                        }
                        onBlur={() => touchVariantField(i, "oldPriceRub")}
                        aria-invalid={vTouched.oldPriceRub && vErrors.oldPriceRub ? true : undefined}
                        className={`w-full rounded-md border bg-tg-surface px-2 py-1.5 text-sm text-tg-text ${fieldBorderClass(!!vTouched.oldPriceRub, !!vErrors.oldPriceRub)}`}
                      />
                      {vTouched.oldPriceRub && vErrors.oldPriceRub && (
                        <p className="mt-1 text-xs text-tg-destructive">{vErrors.oldPriceRub}</p>
                      )}
                    </div>

                    <div>
                      <label
                        className="mb-1 block text-xs text-tg-hint"
                        htmlFor={`variant-${i}-stock`}
                      >
                        Остаток (необязательно, пусто — не считаем)
                      </label>
                      <input
                        id={`variant-${i}-stock`}
                        inputMode="numeric"
                        value={v.stock}
                        onChange={(e) =>
                          updateVariantField(i, "stock", e.target.value)
                        }
                        onBlur={() => touchVariantField(i, "stock")}
                        aria-invalid={vTouched.stock && vErrors.stock ? true : undefined}
                        className={`w-full rounded-md border bg-tg-surface px-2 py-1.5 text-sm text-tg-text ${fieldBorderClass(!!vTouched.stock, !!vErrors.stock)}`}
                      />
                      {vTouched.stock && vErrors.stock && (
                        <p className="mt-1 text-xs text-tg-destructive">{vErrors.stock}</p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeVariantRow(i)}
                      disabled={variants.length <= 1}
                      className="w-full"
                    >
                      Убрать вариант
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-tg-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={saving}
            >
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

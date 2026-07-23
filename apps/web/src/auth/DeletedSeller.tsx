import { restoreWindowEnd } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { useRestoreSeller } from "../seller/useSellerProfile";

// Экран для удалённого продавца (см. Спринт 37) — показывается вместо
// Fork, когда sellerStatus === "deleted", тот же принцип, что и
// BlockedSeller (Спринт 32): sellerId в сессии уже null, продавец не
// может открыть ни один /seller/*-роут, поэтому экран живёт на уровне
// Landing.tsx, не в кабинете (SellerProfile недоступен).
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function DeletedSeller({
  reason,
  deletedAt,
}: {
  reason: string | null;
  deletedAt: Date;
}) {
  const restoreSeller = useRestoreSeller();
  const windowEnd = restoreWindowEnd(deletedAt);

  async function handleRestore() {
    await restoreSeller.mutateAsync();
    window.location.href = "/seller";
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
      <h1 className="y2k-heading font-display text-lg text-tg-text">
        Магазин удалён
      </h1>
      {reason && <p className="text-tg-text">{reason}</p>}
      <p className="text-sm text-tg-hint">
        Восстановить можно до {dateFormatter.format(windowEnd)} — дальше
        данные обезличиваются безвозвратно.
      </p>
      {restoreSeller.isError && (
        <p className="text-sm text-tg-destructive">
          Не удалось восстановить — попробуйте ещё раз.
        </p>
      )}
      <Button
        onClick={handleRestore}
        disabled={restoreSeller.isPending}
        className="mt-2 bg-magenta text-white hover:bg-magenta/90"
      >
        {restoreSeller.isPending ? "Восстанавливаем…" : "Восстановить магазин"}
      </Button>
    </div>
  );
}

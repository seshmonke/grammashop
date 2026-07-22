// Экран для заблокированного продавца (см. STACK.md#роутинг, Спринт 32):
// показывается вместо Fork, когда sellerStatus === "blocked" — отличает
// блокировку от «никогда не регистрировался» (см. Landing.tsx). Контакт
// для разблокировки — Telegram-аккаунт владельца платформы, статическая
// константа, не через API (решение зафиксировано в диалоге 22.07.2026).
const OWNER_CONTACT_USERNAME = "syzrp";

export function BlockedSeller({ reason }: { reason: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
      <h1 className="y2k-heading font-display text-lg text-tg-text">
        Магазин заблокирован
      </h1>
      {reason && <p className="text-tg-text">{reason}</p>}
      <p className="text-sm text-tg-hint">
        По вопросам разблокировки — свяжитесь с{" "}
        <a
          href={`https://t.me/${OWNER_CONTACT_USERNAME}`}
          className="text-tg-link"
        >
          @{OWNER_CONTACT_USERNAME}
        </a>
        .
      </p>
    </div>
  );
}

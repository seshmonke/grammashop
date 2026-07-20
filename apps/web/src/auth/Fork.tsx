import { Link } from "react-router-dom";
import { openExternalLink } from "../lib/telegram";

// Экран-развилка для пользователя без роли (см. STACK.md#роутинг, Спринт
// 21): «О платформе» открывает публичный лендинг во внешнем браузере
// (openLink, Mini App не закрывается), «Открыть магазин» ведёт на форму
// регистрации внутри ТМА.
export function Fork() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="y2k-heading font-display text-2xl text-tg-text">
        grammashop
      </h1>
      <p className="text-tg-hint">
        Своя витрина в Telegram — без своего бота и разработчиков.
      </p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
        <Link
          to="/register"
          className="rounded-2xl bg-magenta py-3 text-center font-medium text-white"
        >
          Открыть магазин
        </Link>
        <button
          type="button"
          onClick={() =>
            openExternalLink(`${window.location.origin}/landing.html`)
          }
          className="rounded-2xl border border-tg-separator py-3 text-center font-medium text-tg-text"
        >
          О платформе
        </button>
      </div>
    </div>
  );
}

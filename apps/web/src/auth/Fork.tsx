import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { openExternalLink } from "../lib/telegram";
import { SLOGANS } from "../lib/slogans";

const SLOGAN_INTERVAL_MS = 4000;

// Сменяет слоган каждые 4с (тот же список, что в hero-карусели лендинга,
// см. lib/slogans.ts) — статичная строка-однострочник звучала как рекламный
// штамп, слоганы уже проверены на лендинге и говорят о боли/желании
// продавца, а не о технической реализации.
function SloganCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % SLOGANS.length),
      SLOGAN_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <p
      key={index}
      className="min-h-12 text-tg-hint [animation:slogan-fade_4s_ease-in-out]"
    >
      {SLOGANS[index]}
    </p>
  );
}

// Экран-развилка для пользователя без роли (см. STACK.md#роутинг, Спринт
// 21): «О платформе» открывает публичный лендинг во внешнем браузере
// (openLink, Mini App не закрывается), «Запустить магазин» ведёт на форму
// регистрации внутри ТМА.
export function Fork() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="y2k-heading font-display text-2xl text-tg-text">
        grammashop
      </h1>
      <SloganCarousel />
      <div className="mt-4 flex w-full max-w-xs flex-col gap-3">
        <Link
          to="/register"
          className="rounded-2xl bg-magenta py-3 text-center font-medium text-white"
        >
          Запустить магазин
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

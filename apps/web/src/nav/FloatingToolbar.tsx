import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

// Общий примитив floating toolbar (см.
// DESIGN_SYSTEM.md#навигация--floating-toolbar): капсула (rounded-full,
// не просто скруглённый прямоугольник) с «каплей» — подсветкой активного
// раздела, перетекающей между вкладками при смене (translateX + spring-
// like easing, без доп. библиотек анимации). Раскраска капли/активного
// текста параметризована — у витрины и админок разные акценты (см.
// TabBar.tsx / AdminToolbar.tsx).
export type ToolbarTab = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export function FloatingToolbar({
  tabs,
  blobClassName,
  activeTextClassName,
  above,
}: {
  tabs: ToolbarTab[];
  blobClassName: string;
  activeTextClassName: string;
  // Доп. блок над капсулой в том же sticky-подвале — сводка чекаута в
  // CartPage (см. TabBar.tsx). Не magic-number `bottom`, привязанный к
  // высоте капсулы, а обычный поток внутри одного sticky-контейнера.
  above?: ReactNode;
}) {
  const location = useLocation();
  const activeIndex = tabs.findIndex((t) => t.to === location.pathname);

  // Меньше двух разделов — нечего листать, тулбар не несёт смысла (см.
  // AdminToolbar: у чистого платформенного админа без своего магазина
  // остался бы один пункт «Платформа»).
  if (tabs.length < 2) return null;

  return (
    // sticky, а не fixed (Спринт 36) — на Telegram Desktop/macOS фиксированный
    // тулбар «едет» при переключении вкладок (клиент неверно пересчитывает
    // вьюпорт при рефлоу контента между разделами, воспроизводится только на
    // Desktop, не на мобильных клиентах; ни один предок в дереве и сам
    // telegram-web-app.js не несут transform/filter — см. «Анализ перед
    // стартом», docs/tasks/36-*.md). sticky позиционируется относительно
    // обычного потока/ближайшего скролл-контейнера, а не отдельно
    // отслеживаемого вьюпорт-прямоугольника, который клиент путает.
    <div className="sticky bottom-0 z-30 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {above}
      <nav
        aria-label="Основная навигация"
        // w-[calc(100%-2rem)] + mx-auto вместо mx-4: на узких экранах даёт
        // те же 16px от краёв, что и раньше, но на широких — max-width
        // капсулы (см. --toolbar-max-width, index.css) центрируется, а не
        // липнет к левому краю с mx-4 фиксированной величины (см.
        // DESIGN_SYSTEM.md#навигация--floating-toolbar, Спринт 39).
        className="tg-glass-toolbar mx-auto mt-3 w-[calc(100%-2rem)] max-w-(--toolbar-max-width) rounded-full border border-tg-separator p-1 shadow-lg"
      >
        <div className="relative flex items-stretch">
          {activeIndex >= 0 && (
            <span
              aria-hidden="true"
              className={`absolute inset-y-0 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${blobClassName}`}
              style={{
                width: `${100 / tabs.length}%`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            />
          )}
          {tabs.map(({ to, label, icon: Icon, badge }, index) => {
            const active = index === activeIndex;
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`toolbar-label-shadow relative z-10 flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-xs font-medium ${
                  active ? activeTextClassName : "text-tg-text"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
                {!!badge && badge > 0 && (
                  <span className="absolute right-1/4 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ice-on-theme px-1 text-[10px] font-semibold tabular-nums text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

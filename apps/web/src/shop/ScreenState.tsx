import { Link } from "react-router-dom";

type Action = { to: string; label: string };

// Единый паттерн пустых/загрузочных/ошибочных состояний витрины (см.
// docs/design/DESIGN_SYSTEM.md#состояния): variant="full" — шапке ещё
// нечего показать (личность магазина/товара не разрешена), variant="inline"
// — шапка уже отрисована, состояние живёт внутри неё в <main>.
export function ScreenState({
  variant,
  title,
  hint,
  action,
}: {
  variant: "full" | "inline";
  title: string;
  hint?: string;
  action?: Action;
}) {
  const content = (
    <>
      <p className="font-medium text-tg-text">{title}</p>
      {hint && <p className="text-sm text-tg-hint">{hint}</p>}
      {action && (
        <Link to={action.to} className="mt-1 text-tg-link">
          {action.label}
        </Link>
      )}
    </>
  );

  if (variant === "full") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      {content}
    </div>
  );
}

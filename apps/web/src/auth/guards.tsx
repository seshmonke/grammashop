import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useSession } from "./session-context";

// Гварды групп маршрутов по способностям сессии (см. STACK.md#роутинг:
// доступность группы определяется ролью, а не отдельными сборками). Роль
// уже резолвнута бэком (AuthProvider), гвард только проверяет флаг. Нет
// доступа — не «403», а редирект на лендинг: тот сам отправит по роли, без
// тупика. Это дешёвая проверка на клиенте (флаг устареет максимум на 1ч
// TTL токена) — быстрый отзыв доступа заблокированному продавцу реального
// запроса обеспечивает бэк (requireSellerId, auth/access.ts, перепроверяет
// статус по БД на каждый запрос /seller/*), не этот гвард.

export function RequireSeller({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.sellerId == null) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const session = useSession();
  if (!session.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

import { useEffect, useState, type ReactNode } from "react";
import { authenticate, type Session } from "./session";
import { registerReauth, setToken } from "./token-store";
import { SessionContext, useSession } from "./session-context";

// Бутстрап сессии на входе в приложение (см. STACK.md#роутинг: main.tsx
// читает initData, бэк выдаёт сессию с ролью). Пока обмен идёт — загрузка;
// провалился — экран ошибки с повтором; готово — раздаём сессию детям.
// Это app-lifecycle, а не кэшируемое серверное состояние, поэтому обычный
// useEffect, а не TanStack Query (тот — для доменных данных: товары, заказы).

// useSession живёт в session-context, реэкспорт для обратной совместимости.
export { useSession };

type Status = "loading" | "ready" | "error";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    // Как response-интерцептор добывает свежий токен на 401 (см.
    // token-store): та же авторизация, но с обновлением контекста.
    registerReauth(async () => {
      const next = await authenticate();
      if (active) setSession(next);
      setToken(next.token);
      return next.token;
    });

    setStatus("loading");
    authenticate()
      .then((next) => {
        if (!active) return;
        setToken(next.token);
        setSession(next);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (status === "error") {
    return (
      <div role="alert">
        <p>Не удалось войти</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          Повторить
        </button>
      </div>
    );
  }

  if (status === "loading" || !session) {
    return <p>Загрузка…</p>;
  }

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

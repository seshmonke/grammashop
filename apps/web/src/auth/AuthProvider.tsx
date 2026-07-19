import { useEffect, useState, type ReactNode } from "react";
import { authenticate, type Session } from "./session";
import { registerReauth, setToken } from "./token-store";
import { SessionContext, useSession } from "./session-context";
import { InitDataUnavailableError } from "./init-data";

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
      .catch((error: unknown) => {
        // Прод вне Telegram — не поломанная сессия, а публичный посетитель:
        // на публичный лендинг, а не в тупиковый экран "не удалось войти"
        // (см. TASKS.md, Спринт 15).
        if (error instanceof InitDataUnavailableError) {
          window.location.replace("/landing.html");
          return;
        }
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

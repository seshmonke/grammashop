import { createContext, useContext } from "react";
import type { Session } from "./session";

// Контекст сессии вынесен из AuthProvider отдельным модулем: так гварды и
// тесты берут useSession/SessionContext без импорта самого провайдера (и без
// его побочных эффектов при монтировании).
export const SessionContext = createContext<Session | null>(null);

// Способности текущей сессии. Кидает вне провайдера — защищённый код не
// рендерится без резолвнутой роли.
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession использован вне AuthProvider");
  }
  return session;
}

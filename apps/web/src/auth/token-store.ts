// Хранилище сессионного JWT — в памяти модуля, не в localStorage: токен
// живёт 1ч и переполучается из initData при каждом открытии ТМА (см.
// STACK.md#авторизация), персистить его незачем и небезопасно. Отдельный
// модуль без импортов, чтобы api-client (интерцепторы) и AuthProvider
// делили состояние без циклической зависимости.

let token: string | null = null;
// Функция повторной авторизации, регистрируется AuthProvider'ом. Через неё
// response-интерцептор на 401 добывает свежий токен, не завися напрямую от
// session-модуля (тот сам импортирует api-client — иначе был бы цикл).
let reauth: (() => Promise<string>) | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(next: string | null): void {
  token = next;
}

export function registerReauth(fn: () => Promise<string>): void {
  reauth = fn;
}

export async function reauthenticate(): Promise<string> {
  if (!reauth) {
    throw new Error("reauth не зарегистрирован (AuthProvider не смонтирован)");
  }
  return reauth();
}

// Сброс между тестами и при размонтировании провайдера.
export function clearSession(): void {
  token = null;
  reauth = null;
}

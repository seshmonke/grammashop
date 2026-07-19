import { QueryClient } from "@tanstack/react-query";

// Единый клиент серверного состояния (см. STACK.md#серверное-состояние):
// кэш доменных данных (товары, заказы) во всех трёх интерфейсах. Ретраи
// сдержанные — 401 уже разово перехватывает axios-интерцептор (см.
// api-client), дублировать его ретраями Query не нужно.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

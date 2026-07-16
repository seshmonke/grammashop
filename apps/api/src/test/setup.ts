import "../env.js";

// Интеграционные тесты идут в grammashop_test, а не в основную БД
// разработки (см. STACK.md#тестирование) — db/client.ts всегда читает
// DATABASE_URL, поэтому переключаем его до того, как код приложения его
// прочитает.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

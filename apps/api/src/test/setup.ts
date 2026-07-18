import "../env.js";

// Интеграционные тесты идут в grammashop_test, а не в основную БД
// разработки (см. STACK.md#тестирование) — db/client.ts всегда читает
// DATABASE_URL, поэтому переключаем его до того, как код приложения его
// прочитает.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// В CI прогон тестов получает только DATABASE_URL_TEST (см. ci.yml) —
// auth-обвязке нужны фиктивные значения: buildApp() падает fail-fast без
// JWT_SECRET, а подпись initData в тестах идёт своим тестовым токеном.
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.TELEGRAM_BOT_TOKEN ??= "123456:TEST-fallback-token";

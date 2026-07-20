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
// S3Client конструируется на импорте модуля (s3/client.ts), а не лениво —
// без региона падает уже на импорте, даже там, где фото не участвуют в
// тесте (products/shop/orders route-тесты тянут его транзитивно через
// images/product-image-lookup.ts). Реальные вызовы S3 либо не происходят
// в этих тестах, либо мокаются точечно (см. product-images.route.test.ts).
// ||=, не ??=: .env локально держит эти переменные объявленными, но
// пустыми (S3_REGION=), а не отсутствующими — ?? их не подхватил бы.
process.env.S3_REGION ||= "ru-central1";
process.env.S3_BUCKET ||= "test-bucket";

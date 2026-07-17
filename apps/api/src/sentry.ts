import * as Sentry from "@sentry/node";
import type { ErrorEvent } from "@sentry/node";

// Известные ПДн-поля чекаута/регистрации (см. CLAUDE.md, раздел про
// 152-ФЗ) — вторая линия защиты сверху sendDefaultPii: false. Первая
// линия (не собирать request.data/cookies вовсе) надёжна сама по себе;
// это только подчищает то, что могло попасть через extra/contexts.
const PII_KEYS = new Set([
  "fio",
  "фио",
  "name",
  "fullName",
  "phone",
  "телефон",
  "address",
  "адрес",
  "email",
]);

function redactPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPii);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      result[key] = PII_KEYS.has(key.toLowerCase())
        ? "[redacted]"
        : redactPii(v);
    }
    return result;
  }
  return value;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
  }
  if (event.extra) {
    event.extra = redactPii(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactPii(event.contexts) as typeof event.contexts;
  }
  return event;
}

export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN_API"];
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    // Не собирать тела запросов/куки/IP по умолчанию — основная защита
    // от утечки ПДн покупателей в события Sentry.
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

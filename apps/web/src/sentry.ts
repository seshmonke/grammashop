import * as Sentry from "@sentry/react";
import type { ErrorEvent } from "@sentry/react";

// Та же логика, что в apps/api/src/sentry.ts — не дублируется в общий
// пакет ради пяти строк, оба места держать в уме вместе с CLAUDE.md
// (раздел про 152-ФЗ).
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
  const dsn = import.meta.env["VITE_SENTRY_DSN_WEB"];
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";
import { startSubscriptionPaymentResponseSchema } from "@grammashop/shared";
import { requireSellerId } from "../auth/access.js";
import { startSubscriptionPayment, settlePayment } from "../services/billing.service.js";
import {
  isWebhookIpCheckEnabled,
  isYooKassaWebhookIp,
} from "../yookassa/webhook-ip.js";

// POST /seller/subscription/pay — первый платёж (привязка карты), см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 26. Возвращает
// confirmation_url для подтверждения продавцом.
//
// POST /billing/webhook — уведомления ЮKassa. Публичный (ЮKassa не шлёт
// JWT), но телу не доверяет: событие лишь триггерит перечитку платежа
// (settlePayment). Rate-limit сразу, как на /auth и заказах.
export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  const webhookRateLimitMax = Number(
    process.env.BILLING_WEBHOOK_RATE_LIMIT_MAX ?? 60,
  );

  fastify.post(
    "/seller/subscription/pay",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
      if (sellerId === null) return;

      // Возвратный URL после подтверждения на стороне ЮKassa — в ТМА.
      // Конфигурируемый (env), т.к. домен различается dev/бой.
      const returnUrl = process.env.SUBSCRIPTION_RETURN_URL || "https://t.me/grammashopbot";
      try {
        const result = await startSubscriptionPayment(sellerId, returnUrl);
        if (!result) {
          return reply.code(404).send({ error: "продавец не найден" });
        }
        return startSubscriptionPaymentResponseSchema.parse(result);
      } catch (err) {
        Sentry.captureException(err);
        return reply.code(502).send({ error: "платёжный провайдер недоступен" });
      }
    },
  );

  fastify.post(
    "/billing/webhook",
    {
      config: {
        rateLimit: { max: webhookRateLimitMax, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      // Defense-in-depth: на бою режем чужие IP до перечитки (гарантия от
      // подделки — сама перечитка, см. webhook-ip.ts). trustProxy включён
      // (app.ts), request.ip — реальный адрес отправителя за Caddy.
      if (isWebhookIpCheckEnabled() && !isYooKassaWebhookIp(request.ip)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = request.body as { object?: { id?: unknown } } | undefined;
      const paymentId = body?.object?.id;
      // Тело не логируем целиком (дисциплина ПДн + гигиена) — извлекаем
      // только id платежа. Некорректное тело — 200, чтобы ЮKassa не
      // ретраила заведомо неусвояемое событие 24 часа.
      if (typeof paymentId !== "string" || paymentId.length === 0) {
        return reply.code(200).send({ ok: true });
      }

      try {
        await settlePayment(paymentId);
      } catch (err) {
        // Провал перечитки/БД — 500, чтобы ЮKassa доставила повторно.
        Sentry.captureException(err);
        return reply.code(500).send({ error: "ошибка обработки" });
      }
      // 200 — ЮKassa игнорирует тело; повторную доставку settlePayment
      // отрабатывает идемпотентно.
      return reply.code(200).send({ ok: true });
    },
  );
}

// Yandex Cloud Function — внешний пинг /health для heartbeat-мониторинга
// (см. docs/tasks/27-subscription-payment-ui-heartbeat.md, «Анализ перед
// стартом»). Отдельный деплой вне pnpm-монорепо (apps/*): это не часть
// продукта, а обвязка мониторинга, запускается на Timer-триггере (cron) в
// Yandex Cloud Functions, деплоится напрямую zip/CLI — свой раздельный
// package.json, без зависимостей монорепо.
//
// Дублирует push-метрики из apps/api/src/monitoring/yandex-monitoring.ts
// намеренно, а не импортирует его: рантайм и способ деплоя (zip в Cloud
// Functions) не пересекаются со сборкой apps/api, тащить сюда монорепо
// ради одной функции — накладнее, чем 15 строк copy-paste.
//
// Настраивается переменными окружения самой Cloud Function (Yandex Cloud
// консоль/CLI, не .env репозитория):
//   HEALTH_URL                    — https://grammashop.online/health
//   YANDEX_MONITORING_API_KEY     — тот же сервис-аккаунт, что у бэкапа
//   YANDEX_MONITORING_FOLDER_ID

const MONITORING_URL =
  "https://monitoring.api.cloud.yandex.net/monitoring/v2/data/write";
const HEALTH_TIMEOUT_MS = 5000;

async function checkHealth(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function pushMetric(apiKey, folderId, name, value) {
  const res = await fetch(
    `${MONITORING_URL}?folderId=${encodeURIComponent(folderId)}&service=custom`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${apiKey}`,
      },
      body: JSON.stringify({ metrics: [{ name, labels: {}, value }] }),
    },
  );
  if (!res.ok) {
    throw new Error(`Yandex Monitoring → HTTP ${res.status}`);
  }
}

module.exports.handler = async function () {
  const healthUrl = process.env.HEALTH_URL;
  const apiKey = process.env.YANDEX_MONITORING_API_KEY;
  const folderId = process.env.YANDEX_MONITORING_FOLDER_ID;
  if (!healthUrl || !apiKey || !folderId) {
    throw new Error(
      "HEALTH_URL / YANDEX_MONITORING_API_KEY / YANDEX_MONITORING_FOLDER_ID не заданы",
    );
  }

  const healthy = await checkHealth(healthUrl);
  await pushMetric(apiKey, folderId, "health.ok", healthy ? 1 : 0);

  return { statusCode: 200, body: JSON.stringify({ healthy }) };
};

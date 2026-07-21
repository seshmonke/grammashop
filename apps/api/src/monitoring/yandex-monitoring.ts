// Тонкий клиент к Yandex Cloud Monitoring API (см. docs/tasks/27-*.md,
// «Анализ перед стартом» — heartbeat-мониторинг на Yandex Cloud, тот же
// провайдер, что и прод-VM). Пишет кастомные метрики (dead-man's switch
// бэкапа, внешний пинг /health) через /monitoring/v2/data/write. Авторизация
// статическим API-ключом сервис-аккаунта (Api-Key, не истекает) — не IAM-
// токеном, чтобы не тащить обвязку обновления токена ради разового пинга
// раз в сутки/N минут.
//
// Best-effort: провал записи метрики не должен валить сам бэкап/чек — если
// метрика не запишется, dead-man's switch в Yandex Monitoring всё равно
// сработает по истечении окна (нет данных = алерт), тем же путём, что и при
// падении самого job'а. Поэтому ошибки здесь только логируются, не бросаются.

const API_URL = "https://monitoring.api.cloud.yandex.net/monitoring/v2/data/write";

function config(): { apiKey: string; folderId: string } | null {
  const apiKey = process.env["YANDEX_MONITORING_API_KEY"];
  const folderId = process.env["YANDEX_MONITORING_FOLDER_ID"];
  if (!apiKey || !folderId) return null;
  return { apiKey, folderId };
}

export async function pushMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {},
): Promise<void> {
  const cfg = config();
  if (!cfg) {
    console.warn(
      `yandex-monitoring: YANDEX_MONITORING_API_KEY/FOLDER_ID не заданы — метрика "${name}" не отправлена`,
    );
    return;
  }

  try {
    const res = await fetch(
      `${API_URL}?folderId=${encodeURIComponent(cfg.folderId)}&service=custom`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Api-Key ${cfg.apiKey}`,
        },
        body: JSON.stringify({ metrics: [{ name, labels, value }] }),
      },
    );
    if (!res.ok) {
      console.error(
        `yandex-monitoring: запись метрики "${name}" → HTTP ${res.status}`,
      );
    }
  } catch (err) {
    console.error(`yandex-monitoring: запись метрики "${name}" упала:`, err);
  }
}

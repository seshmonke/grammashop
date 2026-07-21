// IP-allowlist вебхука ЮKassa — defense-in-depth (см. Спринт 26, «Анализ
// перед стартом»). У ЮKassa нет криптоподписи вебхука; настоящая гарантия
// от подделки — перечитка платежа GET /payments/{id} (settlePayment):
// подделать ответ боевого API атакующий не может. IP-фильтр лишь режет
// поддельный трафик до перечитки, поэтому по умолчанию выключен (в
// sandbox/dev/тестах адреса ЮKassa другие) и включается на бою через
// YOOKASSA_VERIFY_WEBHOOK_IP=true.
//
// Диапазоны — из документации ЮKassa (https://yookassa.ru/developers/using-api/webhooks).

const IPV4_CIDRS: Array<{ base: number; bits: number }> = [
  cidr("185.71.76.0", 27),
  cidr("185.71.77.0", 27),
  cidr("77.75.153.0", 25),
  cidr("77.75.154.128", 25),
  cidr("77.75.156.11", 32),
  cidr("77.75.156.35", 32),
];

// Единственный IPv6-диапазон ЮKassa — /32, сверяем по нормализованному
// префиксу (первые два хекстета), точного разбора IPv6 не требуется.
const IPV6_PREFIX = "2a02:5180:";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    acc = (acc << 8) | n;
  }
  return acc >>> 0;
}

function cidr(base: string, bits: number): { base: number; bits: number } {
  const asInt = ipv4ToInt(base);
  if (asInt === null) throw new Error(`некорректный CIDR: ${base}/${bits}`);
  return { base: asInt, bits };
}

export function isYooKassaWebhookIp(ip: string): boolean {
  // Node может отдать IPv4 в форме "::ffff:1.2.3.4" за IPv6-сокетом.
  const v4 = ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
  const asInt = ipv4ToInt(v4);
  if (asInt !== null) {
    return IPV4_CIDRS.some(({ base, bits }) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (asInt & mask) === (base & mask);
    });
  }
  return ip.toLowerCase().startsWith(IPV6_PREFIX);
}

export function isWebhookIpCheckEnabled(): boolean {
  return process.env.YOOKASSA_VERIFY_WEBHOOK_IP === "true";
}

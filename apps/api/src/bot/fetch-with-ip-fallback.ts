import https from "node:https";
import type { Readable } from "node:stream";

// api.telegram.org иногда недоступен по конкретному IP при полностью
// рабочем DNS и остальной подсети (диагностировано на прод-VM, Спринт 21:
// 149.154.166.110 заблокирован, 149.154.167.220 того же /16 отвечает;
// перепроверено 21.07.2026 на прод-VM живым вызовом getMe — картина не
// изменилась). Перебираем кандидатов по очереди: подключаемся напрямую по
// IP (как curl --resolve), сохраняя оригинальный hostname в SNI (TLS
// servername) и Host-заголовке.
//
// Реализовано через node:https, а не через undici Agent/dispatcher: та
// комбинация (fetch + Agent с явным servername и Host-заголовком) на
// прод-VM неожиданно резолвила hostname заново через DNS и игнорировала
// подставленный IP в URL — воспроизведено и подтверждено 21.07.2026 в
// сравнении с прямым node:https (совпадает с curl --resolve) и обычным
// undici fetch (даёт другие, DNS-резолвленные адреса). Причина не
// выяснена (похоже на особенность конкретной версии undici с Host-
// заголовком, отличным от hostname в URL), но node:https ведёт себя
// предсказуемо, поэтому выбран он.
const TELEGRAM_API_HOSTNAME = "api.telegram.org";
const TELEGRAM_API_IPS = ["149.154.167.220", "149.154.166.110"];

function isReadableStream(value: unknown): value is Readable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Readable).pipe === "function"
  );
}

function requestViaIp(ip: string, url: URL, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = new Headers(init.headers as ConstructorParameters<typeof Headers>[0]);
    headers.set("host", TELEGRAM_API_HOSTNAME);
    const nodeHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      nodeHeaders[key] = value;
    });

    const req = https.request(
      {
        host: ip,
        port: 443,
        path: url.pathname + url.search,
        method: init.method ?? "GET",
        servername: TELEGRAM_API_HOSTNAME,
        headers: nodeHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") responseHeaders.set(key, value);
            else if (Array.isArray(value)) for (const v of value) responseHeaders.append(key, v);
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: responseHeaders,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    if (init.signal) {
      init.signal.addEventListener("abort", () => req.destroy(new Error("aborted")));
    }

    const body = init.body;
    if (body == null) {
      req.end();
    } else if (typeof body === "string" || Buffer.isBuffer(body)) {
      req.end(body);
    } else if (isReadableStream(body)) {
      body.pipe(req);
    } else {
      req.end(String(body));
    }
  });
}

// Кастомный fetch для grammY (client.fetch) — при недоступности первого IP
// пробует следующий, вместо падения на первом же сетевом сбое.
export const fetchWithTelegramIpFallback: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.hostname !== TELEGRAM_API_HOSTNAME) {
    return fetch(input, init);
  }

  let lastError: unknown;
  for (const ip of TELEGRAM_API_IPS) {
    try {
      return await requestViaIp(ip, url, init);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

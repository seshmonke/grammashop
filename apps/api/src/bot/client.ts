import { Bot } from "grammy";
import { fetchWithTelegramIpFallback } from "./fetch-with-ip-fallback.js";

// Платформенный бот (см. STACK.md#telegram-бот) — единственный клиент на
// процесс, ленивый: конструктор не делает сетевых вызовов, но незачем
// падать на импорте модуля, если TELEGRAM_BOT_TOKEN ещё не нужен (роуты,
// не отправляющие сообщений).
let bot: Bot | null = null;

export function getBot(): Bot {
  if (!bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN не задан — бот недоступен");
    }
    bot = new Bot(token, { client: { fetch: fetchWithTelegramIpFallback } });
  }
  return bot;
}

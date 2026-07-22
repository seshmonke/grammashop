import { InlineKeyboard, type Bot } from "grammy";

// Без startapp Mini App открывается на развилке «О платформе / Открыть
// магазин» (apps/web/src/auth/Fork.tsx, Спринт 21) — тот же t.me-паттерн,
// что и у shopLink() в apps/web/src/lib/platform.ts, но без sellerId.
const MINI_APP_URL = "https://t.me/grammashopbot/shop";

// Статический текст, без пользовательского ввода — экранирование (см.
// bot/escape-html.ts) здесь не нужно.
const WELCOME_TEXT =
  "👋 Привет! <b>Grammashop</b> — платформа для магазинов в Telegram.\n\n" +
  "Нажмите кнопку ниже, чтобы посмотреть, как это работает, или открыть свой магазин.";

// Холодный контакт без диплинка (не из лендинга/рекламы) — единственный
// входящий апдейт, который сейчас обрабатывает бот (Спринт 25).
export function registerStartHandler(bot: Bot): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(WELCOME_TEXT, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("🛍 Открыть Grammashop", MINI_APP_URL),
    });
  });
}

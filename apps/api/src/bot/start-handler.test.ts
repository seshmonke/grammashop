import { describe, expect, it } from "vitest";
import { Bot } from "grammy";
import { registerStartHandler } from "./start-handler.js";

// /start — единственный обрабатываемый апдейт (Спринт 25). Тестируем
// через api.config.use (transformer) — без сети и без реального токена
// (см. grammY docs: transformers перехватывают вызов до fetch).
function buildTestBot() {
  const bot = new Bot("test-token");
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "Grammashop",
    username: "grammashopbot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  } as never;
  registerStartHandler(bot);
  return bot;
}

describe("registerStartHandler", () => {
  it("на /start отвечает приветствием с кнопкой на Mini App", async () => {
    const bot = buildTestBot();
    const calls: Array<{ method: string; payload: unknown }> = [];
    bot.api.config.use((_prev, method, payload) => {
      calls.push({ method, payload });
      return Promise.resolve({ ok: true, result: true } as never);
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: 42, type: "private", first_name: "Покупатель" },
        from: {
          id: 42,
          is_bot: false,
          first_name: "Покупатель",
        },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("sendMessage");
    const payload = calls[0]!.payload as {
      chat_id: number;
      text: string;
      reply_markup: { inline_keyboard: Array<Array<{ text: string; url?: string }>> };
    };
    expect(payload.chat_id).toBe(42);
    expect(payload.text).toContain("Grammashop");
    const button = payload.reply_markup.inline_keyboard[0]![0]!;
    expect(button.url).toBe("https://t.me/grammashopbot/shop");
  });
});

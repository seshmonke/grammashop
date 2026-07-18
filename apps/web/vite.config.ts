/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Dev-server настроен под локальный дизайн-цикл через туннель (см.
  // STACK.md#локальный-дизайн-цикл-и-dev-бот). Затрагивает только `vite`
  // (dev), не `vite build` — прод-бандл и docker-сборка не меняются.
  server: {
    // Слушать 0.0.0.0, чтобы до dev-server дотянулся cloudflared-туннель.
    host: true,
    // Порт фиксированный (5173): туннель (scripts/dev-tunnel.sh) targetʼит
    // именно его. Без strictPort Vite при занятом 5173 молча уезжает на
    // 5174 и рассинхронивается с туннелем — тот смотрит в пустой порт.
    // Лучше упасть с внятной ошибкой, чем поднять битый туннель.
    port: 5173,
    strictPort: true,
    // Quick-туннели cloudflared/ngrok дают случайный поддомен, меняющийся
    // при каждом запуске — разрешаем всё семейство, а не конкретный хост.
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io"],
    // Same-origin `/api` — то же, что прод (Caddy `handle_path /api/*` →
    // api:3000, см. Caddyfile): фронт, открытый по HTTPS-урлу туннеля на
    // телефоне, ходит в API через тот же origin, без второго туннеля и CORS.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});

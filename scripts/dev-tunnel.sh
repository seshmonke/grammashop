#!/usr/bin/env bash
# Локальный дизайн-цикл через туннель (см. STACK.md#локальный-дизайн-цикл-и-dev-бот).
# Поднимает всё, что нужно, чтобы открыть Mini App dev-бота на телефоне и
# итерировать вёрстку с hot reload, без деплоя на прод:
#
#   1. postgres + api в докере (api с AUTH_DEV_MODE=true — /auth принимает
#      реальный initData от dev-бота без токена бота на бэке, см.
#      STACK.md#авторизация);
#   2. Vite dev-server на хосте (hot reload; на WSL2 быстрее, чем bind-mount
#      в контейнер) — проксирует /api на api, same-origin как в проде;
#   3. cloudflared quick-туннель → HTTPS-урл на Vite. Этот урл вставляется
#      в Mini App dev-бота через BotFather (/newapp или /myapps).
#
# Веб-контейнер (nginx-билд) НЕ поднимается — его порт 5173 занимает
# host-Vite. Ctrl-C гасит Vite и туннель; докер остаётся поднятым.
set -euo pipefail

cd "$(dirname "$0")/.."

CLOUDFLARED="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"
if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "cloudflared не найден. Установить бинарь:" >&2
  echo "  curl -fsSL -o ~/.local/bin/cloudflared \\" >&2
  echo "    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" >&2
  echo "  chmod +x ~/.local/bin/cloudflared" >&2
  exit 1
fi

echo "==> Поднимаю postgres + api (AUTH_DEV_MODE=true, dev)…"
AUTH_DEV_MODE=true NODE_ENV=development docker compose up -d --build postgres api

echo "==> Запускаю Vite dev-server (host, :5173)…"
pnpm --filter @grammashop/web dev &
VITE_PID=$!

cleanup() {
  echo
  echo "==> Останавливаю Vite и туннель (докер оставляю поднятым)…"
  kill "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Ждём, пока Vite ответит, прежде чем открывать туннель на него.
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://localhost:5173/; then break; fi
  sleep 1
done

echo
echo "======================================================================"
echo " Туннель поднимается. HTTPS-урл ниже (…​.trycloudflare.com) — вставь"
echo " его в Mini App dev-бота: BotFather → /myapps → выбрать app → Edit"
echo " Web App URL. Урл меняется при каждом перезапуске туннеля."
echo "======================================================================"
echo
exec "$CLOUDFLARED" tunnel --url http://localhost:5173 --no-autoupdate

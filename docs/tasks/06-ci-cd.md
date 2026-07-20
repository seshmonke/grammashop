### Спринт 6: CI/CD (веха 6 дорожной карты)

Задачи идут в порядке зависимости. Реестр — GitHub Container Registry
(ghcr.io), SSH-деплой на VM сознательно вынесен из скоупа спринта — VM
(веха 7) ещё не существует, см. [STACK.md#ci-cd](../STACK.md#ci-cd).

- [x] ~~GitHub Actions workflow: job тестов — `postgres` как
  service-контейнер (аналог `docker-compose`), миграции, `pnpm -r test`
  (web + api), триггер на push/PR в `main`~~ — сделано
  (`.github/workflows/ci.yml`, job `test`).
- [x] ~~Job сборки Docker-образов `apps/api` и `apps/web` (существующие
  multi-stage `Dockerfile`), зависит от зелёных тестов~~ — сделано (job
  `build-and-push`, `needs: test`).
- [x] ~~Пуш собранных образов в ghcr.io (тег по SHA коммита), авторизация
  через встроенный `GITHUB_TOKEN`~~ — сделано.
- [x] ~~Проверка руками: пуш в `main` → workflow зелёный → образы видны в
  ghcr.io пакетах репозитория~~ — проверено: run
  [29542419280](https://github.com/seshmonke/grammashop/actions/runs/29542419280)
  зелёный (оба job'а), `ghcr.io/seshmonke/grammashop-api` и
  `-grammashop-web` содержат теги по SHA коммита и `latest` (проверено
  через анонимный pull-токен ghcr.io, `/v2/.../tags/list`).

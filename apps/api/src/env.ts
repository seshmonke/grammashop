import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";

// Резолвится относительно расположения файла, а не cwd — локальные
// команды (pnpm dev/test/db:migrate) запускаются из apps/api через
// `pnpm --filter`, а .env лежит в корне репозитория.
const repoRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

config({ path: path.join(repoRoot, ".env") });

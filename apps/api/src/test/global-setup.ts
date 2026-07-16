import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import "../env.js";

// Прогоняет миграции на тестовой БД перед всем прогоном тестов — иначе
// `pnpm test` тихо ломается на "relation ... does not exist" каждый раз,
// когда grammashop_test пересоздана с нуля (`docker compose down -v`), а
// про ручной db:migrate против неё уже забыли (см. STACK.md#тестирование).
export async function setup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_TEST не задан — нужен для интеграционных тестов, см. .env.example",
    );
  }

  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../drizzle",
  );

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();
}

import "../env.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Резолвится относительно расположения самого файла, а не cwd — иначе
// путь ломается в докере, где процесс стартует из WORKDIR /repo, а не
// из apps/api.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

await migrate(db, { migrationsFolder });
await pool.end();

console.log("migrations applied");

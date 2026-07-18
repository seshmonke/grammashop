import { sql } from "drizzle-orm";
import type { HealthResponse } from "@grammashop/shared";
import { db } from "../db/client.js";

export async function checkHealth(): Promise<HealthResponse> {
  // Проба живости коннекта к Postgres без таблицы-заглушки (health_check
  // убрана вместе с доменной схемой, см. STACK.md#доменная-схема-v1).
  await db.execute(sql`select 1`);
  return { status: "ok" };
}

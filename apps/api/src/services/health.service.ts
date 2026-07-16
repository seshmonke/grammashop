import type { HealthResponse } from "@grammashop/shared";
import { db } from "../db/client.js";
import { healthCheck } from "../db/schema.js";

export async function checkHealth(): Promise<HealthResponse> {
  await db.insert(healthCheck).values({});
  return { status: "ok" };
}

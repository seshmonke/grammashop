import type { FastifyInstance } from "fastify";
import { healthResponseSchema } from "@grammashop/shared";
import { checkHealth } from "../services/health.service.js";

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/health", async () => {
    return healthResponseSchema.parse(await checkHealth());
  });
}

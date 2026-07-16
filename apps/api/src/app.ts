import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.route.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.register(cors, {
    origin: `http://localhost:${process.env["WEB_PORT"] ?? "5173"}`,
  });
  app.register(healthRoutes);
  return app;
}

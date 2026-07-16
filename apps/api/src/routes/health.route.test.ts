import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "@grammashop/shared";
import { buildApp } from "../app.js";

describe("GET /health", () => {
  it("отвечает 200 и телом, прошедшим healthResponseSchema", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: "ok",
    });

    await app.close();
  });
});

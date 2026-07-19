import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InitDataUnavailableError,
  buildMockInitData,
  resolveInitData,
} from "./init-data";

// Резолвер initData: реальный из Telegram-клиента, иначе (браузер вне
// Telegram, dev) — mock, который бэк принимает при AUTH_DEV_MODE=true (см.
// STACK.md#авторизация, «Dev-режим»).

function setWebApp(initData: string | undefined): void {
  (window as unknown as { Telegram?: unknown }).Telegram =
    initData === undefined ? undefined : { WebApp: { initData } };
}

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe("buildMockInitData", () => {
  it("собирает разбираемую строку с user.id и auth_date", () => {
    const raw = buildMockInitData({ id: 123, first_name: "Dev" });
    const params = new URLSearchParams(raw);

    const user = JSON.parse(params.get("user")!) as { id: number };
    expect(user.id).toBe(123);
    expect(Number(params.get("auth_date"))).toBeGreaterThan(0);
  });
});

describe("resolveInitData", () => {
  it("возвращает реальный initData, когда Telegram-клиент его дал", () => {
    setWebApp("user=%7B%22id%22%3A42%7D&auth_date=1&hash=real");
    expect(resolveInitData()).toBe("user=%7B%22id%22%3A42%7D&auth_date=1&hash=real");
  });

  it("в dev без Telegram-клиента отдаёт mock с user.id", () => {
    setWebApp(undefined);
    const raw = resolveInitData();
    const user = JSON.parse(new URLSearchParams(raw).get("user")!) as {
      id: number;
    };
    expect(typeof user.id).toBe("number");
  });

  it("в dev при пустом initData (открыт в браузере вне Telegram) — тоже mock", () => {
    setWebApp("");
    const raw = resolveInitData();
    expect(new URLSearchParams(raw).get("user")).not.toBeNull();
  });

  it("вне dev без Telegram-клиента бросает InitDataUnavailableError", () => {
    vi.stubEnv("DEV", false);
    setWebApp(undefined);
    expect(() => resolveInitData()).toThrow(InitDataUnavailableError);
    vi.unstubAllEnvs();
  });
});

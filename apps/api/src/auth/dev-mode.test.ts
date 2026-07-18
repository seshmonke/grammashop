import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAuthDevModeSafe,
  isAuthDevModeEnabled,
  parseDevInitData,
} from "./dev-mode.js";
import { InitDataError } from "./init-data.js";

// dev-mode — единственное место в бэке, где подпись initData не проверяется
// (см. STACK.md#авторизация, «Dev-режим»). Тесты фиксируют оба
// предохранителя: флаг мёртв в production, и prod+флаг = падение на старте.

describe("isAuthDevModeEnabled", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.AUTH_DEV_MODE = saved.AUTH_DEV_MODE;
    process.env.NODE_ENV = saved.NODE_ENV;
  });

  it("false по умолчанию (флаг не задан)", () => {
    delete process.env.AUTH_DEV_MODE;
    process.env.NODE_ENV = "development";
    expect(isAuthDevModeEnabled()).toBe(false);
  });

  it("true при AUTH_DEV_MODE=true вне production", () => {
    process.env.AUTH_DEV_MODE = "true";
    process.env.NODE_ENV = "development";
    expect(isAuthDevModeEnabled()).toBe(true);
  });

  it("false в production даже при выставленном флаге", () => {
    process.env.AUTH_DEV_MODE = "true";
    process.env.NODE_ENV = "production";
    expect(isAuthDevModeEnabled()).toBe(false);
  });

  it("любое значение кроме строки 'true' → false", () => {
    process.env.NODE_ENV = "development";
    for (const raw of ["1", "yes", "TRUE", "", "on"]) {
      process.env.AUTH_DEV_MODE = raw;
      expect(isAuthDevModeEnabled()).toBe(false);
    }
  });
});

describe("assertAuthDevModeSafe", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env.AUTH_DEV_MODE = saved.AUTH_DEV_MODE;
    process.env.NODE_ENV = saved.NODE_ENV;
  });

  it("бросает при AUTH_DEV_MODE=true и NODE_ENV=production", () => {
    process.env.AUTH_DEV_MODE = "true";
    process.env.NODE_ENV = "production";
    expect(() => assertAuthDevModeSafe()).toThrow();
  });

  it("молчит вне production", () => {
    process.env.AUTH_DEV_MODE = "true";
    process.env.NODE_ENV = "development";
    expect(() => assertAuthDevModeSafe()).not.toThrow();
  });

  it("молчит в production без флага", () => {
    delete process.env.AUTH_DEV_MODE;
    process.env.NODE_ENV = "production";
    expect(() => assertAuthDevModeSafe()).not.toThrow();
  });
});

describe("parseDevInitData", () => {
  it("извлекает telegram_id из user без проверки подписи", () => {
    const initData = new URLSearchParams({
      user: JSON.stringify({ id: 555000111, first_name: "Dev" }),
      auth_date: "1",
    }).toString();

    expect(parseDevInitData(initData)).toBe(555000111);
  });

  it("принимает mock без поля hash (в реальном initData оно обязательно)", () => {
    const initData = "user=" + encodeURIComponent(JSON.stringify({ id: 42 }));
    expect(parseDevInitData(initData)).toBe(42);
  });

  it("бросает InitDataError без поля user", () => {
    expect(() => parseDevInitData("auth_date=1")).toThrow(InitDataError);
  });

  it("бросает InitDataError при user.id не-числе", () => {
    const initData =
      "user=" + encodeURIComponent(JSON.stringify({ id: "нет", first_name: "x" }));
    expect(() => parseDevInitData(initData)).toThrow(InitDataError);
  });
});

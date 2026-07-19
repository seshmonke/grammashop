import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../lib/api-client";
import {
  clearSession,
  registerReauth,
  setToken,
} from "./token-store";

// Интерцепторы axios: подстановка JWT в запрос и разовая пере-авторизация
// на 401 (см. STACK.md#авторизация — «протухший JWT фронт молча меняет на
// новый через повторный /auth»). Сеть подменяем mock-адаптером.

const realAdapter = apiClient.defaults.adapter;

afterEach(() => {
  apiClient.defaults.adapter = realAdapter;
  clearSession();
  vi.restoreAllMocks();
});

describe("request-интерцептор", () => {
  it("добавляет Authorization: Bearer при наличии токена", async () => {
    setToken("jwt-123");
    let seen: string | undefined;
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      seen = config.headers.Authorization as string | undefined;
      return {
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await apiClient.get("/health");
    expect(seen).toBe("Bearer jwt-123");
  });

  it("без токена заголовок Authorization не ставит", async () => {
    let seen: unknown;
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      seen = config.headers.Authorization;
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    await apiClient.get("/health");
    expect(seen).toBeUndefined();
  });
});

describe("response-интерцептор: 401", () => {
  beforeEach(() => setToken("stale"));

  it("на 401 пере-авторизуется и повторяет запрос с новым токеном", async () => {
    const reauth = vi.fn(async () => {
      setToken("fresh");
      return "fresh";
    });
    registerReauth(reauth);

    let calls = 0;
    const seen: (string | undefined)[] = [];
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      seen.push(config.headers.Authorization as string | undefined);
      if (calls === 1) {
        throw {
          isAxiosError: true,
          config,
          response: { status: 401, data: {}, statusText: "", headers: {}, config },
        };
      }
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };

    const res = await apiClient.get("/orders");
    expect(reauth).toHaveBeenCalledTimes(1);
    expect(calls).toBe(2);
    expect(seen[0]).toBe("Bearer stale");
    expect(seen[1]).toBe("Bearer fresh");
    expect(res.data).toEqual({ ok: true });
  });

  it("401 от самого /auth не зацикливает (reauth не вызывается)", async () => {
    const reauth = vi.fn(async () => "fresh");
    registerReauth(reauth);

    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, statusText: "", headers: {}, config },
      };
    };

    await expect(apiClient.post("/auth", {})).rejects.toBeDefined();
    expect(reauth).not.toHaveBeenCalled();
  });

  it("повторный 401 после пере-авторизации не зацикливает", async () => {
    registerReauth(async () => {
      setToken("fresh");
      return "fresh";
    });

    let calls = 0;
    apiClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw {
        isAxiosError: true,
        config,
        response: { status: 401, data: {}, statusText: "", headers: {}, config },
      };
    };

    await expect(apiClient.get("/orders")).rejects.toBeDefined();
    // Первый вызов + один retry, не бесконечно.
    expect(calls).toBe(2);
  });
});

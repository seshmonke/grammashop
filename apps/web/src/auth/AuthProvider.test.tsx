import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useSession } from "./AuthProvider";
import { apiClient } from "../lib/api-client";
import { clearSession, getToken } from "./token-store";
import { InitDataUnavailableError } from "./init-data";
import * as sessionModule from "./session";

// AuthProvider на маунте меняет initData на сессию (POST /auth) и раздаёт её
// через useSession. До готовности — загрузка, на провале — экран ошибки.
// apiClient мокаем, initData резолвится dev-моком (jsdom, вне Telegram).

vi.mock("../lib/api-client", () => ({
  apiClient: { post: vi.fn() },
}));

const post = vi.mocked(apiClient.post);

afterEach(() => {
  clearSession();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function Probe() {
  const session = useSession();
  return (
    <div>
      tg:{session.telegramId} seller:{String(session.sellerId)} admin:
      {String(session.isAdmin)}
    </div>
  );
}

describe("AuthProvider", () => {
  it("после обмена раздаёт сессию и кладёт токен в store", async () => {
    post.mockResolvedValue({
      data: {
        token: "jwt-abc",
        telegramId: 555,
        telegramUsername: null,
        sellerId: 7,
        isAdmin: true,
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText(/tg:555/)).toBeInTheDocument();
    expect(screen.getByText(/seller:7/)).toBeInTheDocument();
    expect(screen.getByText(/admin:true/)).toBeInTheDocument();
    expect(getToken()).toBe("jwt-abc");
    // Тело запроса — { initData: <строка> }, ПДн/детали не проверяем.
    expect(post).toHaveBeenCalledWith("/auth", {
      initData: expect.any(String),
    });
  });

  it("на провале обмена показывает экран ошибки, а не детей", async () => {
    post.mockRejectedValue(new Error("network"));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText(/не удалось войти/i)).toBeInTheDocument();
    expect(screen.queryByText(/tg:/)).not.toBeInTheDocument();
  });

  it("прод вне Telegram (InitDataUnavailableError) — редирект на /landing.html, не экран ошибки", async () => {
    vi.spyOn(sessionModule, "authenticate").mockRejectedValue(
      new InitDataUnavailableError(),
    );
    const replaceMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: replaceMock },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/landing.html"),
    );
    expect(screen.queryByText(/не удалось войти/i)).not.toBeInTheDocument();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("до ответа показывает загрузку", () => {
    post.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText(/загрузка/i)).toBeInTheDocument();
  });
});

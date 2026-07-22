import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SessionContext } from "./session-context";
import { RequireAdmin, RequireSeller } from "./guards";
import { Landing } from "./Landing";
import type { Session } from "./session";
import * as telegram from "../lib/telegram";

const buyer: Session = {
  token: "t",
  telegramId: 1,
  telegramUsername: null,
  sellerId: null,
  sellerStatus: null,
  blockedReason: null,
  isAdmin: false,
};
const seller: Session = { ...buyer, sellerId: 9, sellerStatus: "active" };
const admin: Session = { ...buyer, isAdmin: true };
const blockedSeller: Session = {
  ...buyer,
  sellerStatus: "blocked",
  blockedReason: "Жалобы покупателей",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function renderRoute(path: string, session: Session, ui: ReactNode) {
  return render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<div>LANDING</div>} />
          <Route path="/seller" element={<div>SELLER-PAGE</div>} />
          <Route path="/platform" element={<div>PLATFORM-PAGE</div>} />
          <Route path="/guarded-seller" element={ui} />
          <Route path="/guarded-admin" element={ui} />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
}

describe("RequireSeller", () => {
  const page = (
    <RequireSeller>
      <div>SELLER-ONLY</div>
    </RequireSeller>
  );

  it("пускает продавца", () => {
    renderRoute("/guarded-seller", seller, page);
    expect(screen.getByText("SELLER-ONLY")).toBeInTheDocument();
  });

  it("покупателя редиректит на лендинг", () => {
    renderRoute("/guarded-seller", buyer, page);
    expect(screen.getByText("LANDING")).toBeInTheDocument();
    expect(screen.queryByText("SELLER-ONLY")).not.toBeInTheDocument();
  });
});

describe("RequireAdmin", () => {
  const page = (
    <RequireAdmin>
      <div>ADMIN-ONLY</div>
    </RequireAdmin>
  );

  it("пускает админа", () => {
    renderRoute("/guarded-admin", admin, page);
    expect(screen.getByText("ADMIN-ONLY")).toBeInTheDocument();
  });

  it("продавца-не-админа редиректит на лендинг", () => {
    renderRoute("/guarded-admin", seller, page);
    expect(screen.getByText("LANDING")).toBeInTheDocument();
  });
});

describe("Landing", () => {
  function renderLanding(session: Session) {
    // Landing рендерит StorefrontHome (useShopCatalog → useQuery), поэтому
    // нужен QueryClientProvider. Витрину не бьём по сети: проверяем только
    // куда Landing направляет (редирект по роли vs остаётся на витрине).
    const queryClient = new QueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>
          <MemoryRouter initialEntries={["/"]}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/seller" element={<div>SELLER-PAGE</div>} />
              <Route path="/platform" element={<div>PLATFORM-PAGE</div>} />
              <Route path="/register" element={<div>REGISTER-PAGE</div>} />
            </Routes>
          </MemoryRouter>
        </SessionContext.Provider>
      </QueryClientProvider>,
    );
  }

  it("продавца без start_param ведёт в свою админку", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue(undefined);
    renderLanding(seller);
    expect(screen.getByText("SELLER-PAGE")).toBeInTheDocument();
  });

  it("админа без start_param ведёт в платформенную админку", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue(undefined);
    renderLanding(admin);
    expect(screen.getByText("PLATFORM-PAGE")).toBeInTheDocument();
  });

  it("при start_param (seller_id) показывает витрину, а не админку", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue("42");
    renderLanding(seller);
    // Витрина смонтирована (грузит каталог), в админку не увело.
    expect(screen.getByText(/загрузка магазина/i)).toBeInTheDocument();
    expect(screen.queryByText("SELLER-PAGE")).not.toBeInTheDocument();
  });

  it("покупателя без роли и start_param ведёт на экран-развилку", () => {
    // Без dev-фолбэка seller_id (иначе .env.local протекает в тест).
    vi.stubEnv("VITE_DEV_SELLER_ID", "");
    vi.spyOn(telegram, "getStartParam").mockReturnValue(undefined);
    renderLanding(buyer);
    expect(screen.getByText(/запустить магазин/i)).toBeInTheDocument();
    expect(screen.getByText(/о платформе/i)).toBeInTheDocument();
  });

  it("start_param=register без магазина ведёт на форму регистрации", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue("register");
    renderLanding(buyer);
    expect(screen.getByText("REGISTER-PAGE")).toBeInTheDocument();
  });

  it("start_param=register с уже существующим магазином ведёт в админку", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue("register");
    renderLanding(seller);
    expect(screen.getByText("SELLER-PAGE")).toBeInTheDocument();
  });

  it("заблокированного продавца ведёт на экран блокировки с причиной, а не на Fork", () => {
    vi.spyOn(telegram, "getStartParam").mockReturnValue(undefined);
    renderLanding(blockedSeller);
    expect(screen.getByText(/магазин заблокирован/i)).toBeInTheDocument();
    expect(screen.getByText(/жалобы покупателей/i)).toBeInTheDocument();
    expect(screen.getByText("@syzrp")).toBeInTheDocument();
    expect(screen.queryByText(/запустить магазин/i)).not.toBeInTheDocument();
  });
});

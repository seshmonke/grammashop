import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuyerOrder } from "@grammashop/shared";
import { OrdersPage } from "./OrdersPage";

// Кнопка «Отменить заказ» видна только для заказов в статусе new и гейтится
// confirm (Спринт 43). Хуки данных/мутации и TabBar замоканы — тест про
// поведение экрана, не про сеть.

const mutate = vi.fn();
let ordersData: BuyerOrder[] = [];

vi.mock("../../shop/seller-id", () => ({ resolveSellerId: () => 5 }));
vi.mock("../../nav/TabBar", () => ({ TabBar: () => null }));
vi.mock("../../checkout/useBuyerOrders", () => ({
  useBuyerOrders: () => ({ data: ordersData, isLoading: false, isError: false }),
}));
vi.mock("../../checkout/useCancelOrder", () => ({
  useCancelOrder: () => ({ mutate, isPending: false, isError: false, variables: undefined }),
}));

function makeOrder(id: number, status: BuyerOrder["status"]): BuyerOrder {
  return {
    id,
    sellerId: 5,
    shopName: "Магазин",
    telegramUsername: "shop",
    status,
    totalKopecks: 300000,
    createdAt: new Date("2026-07-20T10:00:00Z"),
    items: [{ variantId: 1, productName: "Худи", variantName: "M", priceKopecks: 300000, quantity: 1 }],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <OrdersPage />
    </MemoryRouter>,
  );
}

describe("OrdersPage — отмена заказа", () => {
  afterEach(() => {
    mutate.mockReset();
    vi.restoreAllMocks();
    ordersData = [];
  });

  it("кнопку отмены показывает только для заказа в статусе new", () => {
    ordersData = [makeOrder(1, "new"), makeOrder(2, "paid")];
    renderPage();
    // Один заказ new → одна кнопка отмены.
    expect(screen.getAllByRole("button", { name: "Отменить заказ" })).toHaveLength(1);
  });

  it("подтверждённый клик вызывает отмену с id заказа", async () => {
    ordersData = [makeOrder(7, "new")];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Отменить заказ" }));

    expect(mutate).toHaveBeenCalledWith(7);
  });

  it("отказ в confirm не вызывает отмену", async () => {
    ordersData = [makeOrder(7, "new")];
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Отменить заказ" }));

    expect(mutate).not.toHaveBeenCalled();
  });
});

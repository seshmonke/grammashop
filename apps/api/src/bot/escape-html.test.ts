import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html.js";

describe("escapeHtml", () => {
  it("экранирует &, < и >", () => {
    expect(escapeHtml("Тинькофф & Ко <VIP>")).toBe("Тинькофф &amp; Ко &lt;VIP&gt;");
  });

  it("текст без спецсимволов не меняется", () => {
    expect(escapeHtml("Москва, ул. Примерная, 1")).toBe("Москва, ул. Примерная, 1");
  });
});

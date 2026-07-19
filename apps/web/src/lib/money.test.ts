import { describe, expect, it } from "vitest";
import { formatPrice } from "./money";

// Цены хранятся в копейках (int), витрина показывает рубли. Разделители
// Intl — юникодные пробелы, нормализуем в обычный пробел для сравнения.
const norm = (s: string) => s.replace(/\s/g, " ");

describe("formatPrice", () => {
  it("целые рубли — без копеек", () => {
    expect(norm(formatPrice(199000))).toBe("1 990 ₽");
    expect(norm(formatPrice(50000))).toBe("500 ₽");
  });

  it("с копейками — через запятую", () => {
    expect(norm(formatPrice(199050))).toBe("1 990,50 ₽");
  });

  it("ноль", () => {
    expect(norm(formatPrice(0))).toBe("0 ₽");
  });
});

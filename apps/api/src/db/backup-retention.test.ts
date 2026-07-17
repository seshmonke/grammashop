import { describe, expect, it } from "vitest";
import { selectKeysToDelete } from "./backup-retention.js";

function keyFor(date: string): string {
  return `backups/grammashop-${date}.sql.gz`;
}

describe("selectKeysToDelete", () => {
  it("ничего не удаляет, пока дампов меньше дневной ретенции", () => {
    const keys = ["2026-07-14", "2026-07-15", "2026-07-16"].map(keyFor);

    expect(selectKeysToDelete(keys)).toEqual([]);
  });

  it("оставляет последние 7 дампов без учёта недель", () => {
    const dates = [
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ];
    const keys = dates.map(keyFor);

    expect(selectKeysToDelete(keys)).toEqual([]);
  });

  it("за пределами 7 дневных хранит по одному дампу на неделю для 4 недель, остальное удаляет", () => {
    // 18.07.2026 — суббота. 7 дневных дампов покрывают 12-18 июля.
    // Дальше в глубь: по одному представителю на каждую из следующих
    // 4 отдельных ISO-недель, остальные дни этих недель — на удаление.
    const daily = [
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ];
    const week1 = ["2026-07-06", "2026-07-08", "2026-07-11"]; // ISO week 28
    const week2 = ["2026-06-29", "2026-07-02"]; // ISO week 27
    const week3 = ["2026-06-24"]; // ISO week 26
    const week4 = ["2026-06-15", "2026-06-19"]; // ISO week 25
    const week5 = ["2026-06-08"]; // ISO week 24 — за пределами недельной ретенции

    const keys = [
      ...daily,
      ...week1,
      ...week2,
      ...week3,
      ...week4,
      ...week5,
    ].map(keyFor);

    const deleted = selectKeysToDelete(keys);

    // Из week1 остаётся самый свежий (07-11), остальные два — на удаление.
    expect(deleted).toEqual(
      expect.arrayContaining([keyFor("2026-07-06"), keyFor("2026-07-08")]),
    );
    expect(deleted).not.toContain(keyFor("2026-07-11"));

    // Из week2 остаётся самый свежий (07-02).
    expect(deleted).toContain(keyFor("2026-06-29"));
    expect(deleted).not.toContain(keyFor("2026-07-02"));

    // week3 — единственный дамп недели, остаётся.
    expect(deleted).not.toContain(keyFor("2026-06-24"));

    // Из week4 остаётся самый свежий (06-19).
    expect(deleted).toContain(keyFor("2026-06-15"));
    expect(deleted).not.toContain(keyFor("2026-06-19"));

    // week5 — 5-я по счёту отдельная неделя, за пределами недельной
    // ретенции (4 недели) — удаляется целиком.
    expect(deleted).toContain(keyFor("2026-06-08"));

    expect(deleted).toHaveLength(5);
  });

  it("игнорирует ключи, не совпадающие с форматом имени дампа", () => {
    const keys = ["backups/README.txt", "backups/grammashop-not-a-date.sql.gz"];

    expect(selectKeysToDelete(keys)).toEqual([]);
  });
});

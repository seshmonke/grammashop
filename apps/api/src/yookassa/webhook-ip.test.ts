import { describe, expect, it } from "vitest";
import { isYooKassaWebhookIp } from "./webhook-ip.js";

describe("isYooKassaWebhookIp", () => {
  it("принимает адреса из опубликованных IPv4-диапазонов ЮKassa", () => {
    expect(isYooKassaWebhookIp("185.71.76.0")).toBe(true);
    expect(isYooKassaWebhookIp("185.71.76.31")).toBe(true); // конец /27
    expect(isYooKassaWebhookIp("185.71.77.15")).toBe(true);
    expect(isYooKassaWebhookIp("77.75.153.100")).toBe(true); // /25
    expect(isYooKassaWebhookIp("77.75.156.11")).toBe(true); // /32
  });

  it("отклоняет адреса вне диапазонов", () => {
    expect(isYooKassaWebhookIp("185.71.76.32")).toBe(false); // за /27
    expect(isYooKassaWebhookIp("8.8.8.8")).toBe(false);
    expect(isYooKassaWebhookIp("77.75.156.12")).toBe(false); // не /32-хост
  });

  it("разворачивает IPv4-mapped IPv6 (::ffff:)", () => {
    expect(isYooKassaWebhookIp("::ffff:185.71.76.5")).toBe(true);
    expect(isYooKassaWebhookIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("принимает единственный IPv6-диапазон по префиксу", () => {
    expect(isYooKassaWebhookIp("2a02:5180:0:1234::1")).toBe(true);
    expect(isYooKassaWebhookIp("2a02:6000::1")).toBe(false);
  });

  it("отклоняет мусор", () => {
    expect(isYooKassaWebhookIp("не-ip")).toBe(false);
    expect(isYooKassaWebhookIp("999.1.1.1")).toBe(false);
  });
});

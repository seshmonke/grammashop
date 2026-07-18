import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./init-data.js";

const BOT_TOKEN = "123456:TEST-token-for-signing";

// Независимая от реализации подпись initData по алгоритму Telegram
// (secret_key = HMAC(key="WebAppData", data=token); hash =
// HMAC(key=secret_key, data=data_check_string)). Тест — спецификация:
// если верификатор согласится с этой подписью, значит алгоритм совпал.
function signInitData(
  fields: Record<string, string>,
  token = BOT_TOKEN,
): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

const user = {
  id: 278003862,
  first_name: "Yoshi",
  last_name: "Hoshi",
  username: "syzrp",
  language_code: "ru",
};

describe("verifyInitData", () => {
  it("принимает валидный initData и возвращает разобранного пользователя", () => {
    const initData = signInitData({
      user: JSON.stringify(user),
      auth_date: String(nowSeconds()),
      query_id: "AAABBBCCC",
    });

    const result = verifyInitData(initData, BOT_TOKEN);

    expect(result.user.id).toBe(user.id);
    expect(result.user.username).toBe("syzrp");
  });

  it("отвергает подделанный hash", () => {
    const initData = signInitData({
      user: JSON.stringify(user),
      auth_date: String(nowSeconds()),
    });
    const tampered = initData.replace(/hash=[0-9a-f]+/, `hash=${"0".repeat(64)}`);

    expect(() => verifyInitData(tampered, BOT_TOKEN)).toThrow();
  });

  it("отвергает подпись, сделанную чужим токеном", () => {
    const initData = signInitData(
      { user: JSON.stringify(user), auth_date: String(nowSeconds()) },
      "999999:OTHER-token",
    );

    expect(() => verifyInitData(initData, BOT_TOKEN)).toThrow();
  });

  it("отвергает initData без hash", () => {
    const params = new URLSearchParams({
      user: JSON.stringify(user),
      auth_date: String(nowSeconds()),
    });

    expect(() => verifyInitData(params.toString(), BOT_TOKEN)).toThrow();
  });

  it("отвергает протухший initData (auth_date старше maxAgeSeconds)", () => {
    const initData = signInitData({
      user: JSON.stringify(user),
      auth_date: String(nowSeconds() - 60 * 60 * 25),
    });

    expect(() =>
      verifyInitData(initData, BOT_TOKEN, { maxAgeSeconds: 60 * 60 * 24 }),
    ).toThrow();
  });
});

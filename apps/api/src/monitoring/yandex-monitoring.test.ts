import { afterEach, describe, expect, it, vi } from "vitest";
import { pushMetric } from "./yandex-monitoring.js";

describe("pushMetric", () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...OLD_ENV };
  });

  function stubFetchOk() {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("шлёт Api-Key, folderId и service=custom", async () => {
    process.env["YANDEX_MONITORING_API_KEY"] = "key_1";
    process.env["YANDEX_MONITORING_FOLDER_ID"] = "folder_1";
    const fetchMock = stubFetchOk();

    await pushMetric("backup.success", 1, { host: "vm" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://monitoring.api.cloud.yandex.net/monitoring/v2/data/write?folderId=folder_1&service=custom",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Api-Key key_1");
    expect(JSON.parse(init.body)).toEqual({
      metrics: [{ name: "backup.success", labels: { host: "vm" }, value: 1 }],
    });
  });

  it("не бросает и не шлёт запрос, если ключ/folderId не заданы", async () => {
    delete process.env["YANDEX_MONITORING_API_KEY"];
    delete process.env["YANDEX_MONITORING_FOLDER_ID"];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(pushMetric("backup.success", 1)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("не бросает при сетевой ошибке — только логирует", async () => {
    process.env["YANDEX_MONITORING_API_KEY"] = "key_1";
    process.env["YANDEX_MONITORING_FOLDER_ID"] = "folder_1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(pushMetric("backup.success", 1)).resolves.toBeUndefined();
  });

  it("не бросает при не-2xx ответе — только логирует", async () => {
    process.env["YANDEX_MONITORING_API_KEY"] = "key_1";
    process.env["YANDEX_MONITORING_FOLDER_ID"] = "folder_1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(pushMetric("backup.success", 1)).resolves.toBeUndefined();
  });
});

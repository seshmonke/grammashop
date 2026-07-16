import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api-client";
import { HealthStatus } from "./HealthStatus";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

describe("HealthStatus", () => {
  it("отображает статус, полученный от GET /health", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { status: "ok" } });

    render(<HealthStatus />);

    await waitFor(() => {
      expect(screen.getByText("ok")).toBeInTheDocument();
    });
    expect(apiClient.get).toHaveBeenCalledWith("/health");
  });
});

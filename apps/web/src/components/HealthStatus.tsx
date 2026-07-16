import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export function HealthStatus() {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ status: string }>("/health")
      .then((response) => setStatus(response.data.status))
      .catch(() => setStatus("error"));
  }, []);

  return <p className="mt-4 text-sm text-muted-foreground">{status ?? "…"}</p>;
}

import { Button } from "@/components/ui/button";
import { HealthStatus } from "@/components/HealthStatus";

export function StorefrontHome() {
  return (
    <div className="p-4">
      <h1 className="text-lg font-medium">Витрина</h1>
      <Button className="mt-4">Плейсхолдер</Button>
      <HealthStatus />
    </div>
  );
}

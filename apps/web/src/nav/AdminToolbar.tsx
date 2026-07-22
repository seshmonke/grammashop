import { Package, ClipboardList, Settings, ShieldCheck } from "lucide-react";
import { useSession } from "../auth/session-context";
import { FloatingToolbar, type ToolbarTab } from "./FloatingToolbar";

// Навигация продавцовской/платформенной админки — тот же паттерн, что и
// TabBar витрины (см. DESIGN_SYSTEM.md#навигация--floating-toolbar), но
// нейтральный акцент (--tg-accent, не ice/magenta): админки не получают
// брендовый Y2K-акцент (см. STACK.md#дизайн-направление). Разделы
// продавца показываются только когда есть свой магазин (`sellerId`) —
// «Платформа» добавляется отдельно для админов, независимо от этого
// (isAdmin и sellerId — разные признаки, см. auth.service.ts). Меньше
// двух пунктов (чистый платформенный админ без магазина) — FloatingToolbar
// сам не рендерится.
export function AdminToolbar() {
  const session = useSession();

  const tabs: ToolbarTab[] = [];
  if (session.sellerId != null) {
    tabs.push(
      { to: "/seller", label: "Товары", icon: Package },
      { to: "/seller/orders", label: "Заказы", icon: ClipboardList },
      { to: "/seller/profile", label: "Настройки", icon: Settings },
    );
  }
  if (session.isAdmin) {
    tabs.push({ to: "/platform", label: "Платформа", icon: ShieldCheck });
  }

  return (
    <FloatingToolbar
      tabs={tabs}
      blobClassName="bg-tg-accent/15"
      activeTextClassName="text-tg-accent"
    />
  );
}

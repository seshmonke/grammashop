import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Размонтируем отрендеренное дерево после каждого теста. Авто-cleanup RTL
// подписывается на глобальный afterEach только при vitest `globals: true`
// — у нас его нет, поэтому подключаем явно, иначе DOM течёт между тестами.
afterEach(() => {
  cleanup();
});

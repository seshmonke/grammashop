// Общая рамка инпута для форм с блюр-валидацией (канон —
// CheckoutPage.tsx/docs/design/DESIGN_SYSTEM.md#формы): не тронуто —
// нейтральная рамка; тронуто и невалидно — destructive; тронуто и валидно —
// success. Выделено сюда Спринтом 29, чтобы не копировать одну и ту же
// функцию в каждую форму, переведённую на канон.
export function fieldBorderClass(touched: boolean, hasError: boolean): string {
  if (!touched) return "border-tg-separator";
  return hasError ? "border-tg-destructive" : "border-tg-success";
}

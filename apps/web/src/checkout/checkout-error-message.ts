import axios from "axios";
import { INSUFFICIENT_STOCK_ERROR } from "@grammashop/shared";

// Три разных сообщения под три разных случая (см. Спринт 31): сетевая
// ошибка/оффлайн отличается от "нет остатка", чтобы покупатель не пытался
// проверить связь, когда на самом деле кончился товар, и наоборот. Всё
// остальное (404 продавец/вариант не найден и т.п.) — общий текст, эти
// случаи не требуют отдельной реакции покупателя.
export function checkoutErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Не удалось связаться с сервером — проверьте подключение и попробуйте ещё раз.";
    }
    if (error.response.data?.error === INSUFFICIENT_STOCK_ERROR) {
      return "Одного из товаров уже не хватает на складе — обновите корзину и попробуйте снова.";
    }
  }
  return "Не удалось оформить заказ — попробуйте ещё раз.";
}

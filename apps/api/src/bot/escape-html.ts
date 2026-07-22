// Экранирование для parse_mode: "HTML" (Bot API): только 3 символа вне
// тегов, в отличие от 18 у MarkdownV2 — выбор сделан из-за ПДн-полей
// покупателя (ФИО/адрес/комментарий), которые подставляются в текст
// уведомления и не должны ломать разметку/запрос (см. Спринт 31).
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

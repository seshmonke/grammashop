import axios from "axios";

// baseURL берём из VITE_API_URL (см. .env.example) — браузер обращается к
// apps/api напрямую по опубликованному порту, не через прокси dev-сервера.
export const apiClient = axios.create({
  baseURL: import.meta.env["VITE_API_URL"] ?? "http://localhost:3000",
});

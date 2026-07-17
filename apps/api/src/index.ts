import "./env.js";
import { initSentry } from "./sentry.js";
import { buildApp } from "./app.js";

initSentry();

const port = Number(process.env.API_PORT) || 3000;
const app = buildApp();

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

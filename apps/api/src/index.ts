import { createServer } from "node:http";

const port = Number(process.env.API_PORT) || 3000;

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ message: "hello world" }));
});

server.listen(port, () => {
  console.log(`api listening on :${port}`);
});


#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { buildDocs } from "./docs-core.mjs";

const { outDir } = buildDocs();
const port = Number(process.env.PORT ?? 4174);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  let filePath = path.join(outDir, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(outDir, "404.html");
    response.statusCode = 404;
  }
  response.setHeader("Content-Type", contentTypes[path.extname(filePath)] ?? "application/octet-stream");
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Nullark docs local server: http://127.0.0.1:${port}/`);
});

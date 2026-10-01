import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = 4317;
const types = {
  ".html": "text/html; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    const type = types[path.extname(file)];
    if (!file.startsWith(root + path.sep) || !type) {
      response.writeHead(404);
      response.end();
      return;
    }
    const data = await fs.readFile(file);
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `PREVIEW_PORT_IN_USE ${port}` : error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(`UI_PREVIEW http://127.0.0.1:${port}`));

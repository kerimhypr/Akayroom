const http = require("http");
const fs = require("fs");
const path = require("path");

// Serves the Next.js static export (../out) — Render legacy start: cd realtime-signaling && npm start
const ROOT = path.join(__dirname, "..", "out");
const PORT = process.env.PORT || 3000;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    try {
      let p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (err, data) => {
        if (err) {
          // SPA fallback
          fs.readFile(path.join(ROOT, "index.html"), (e2, d2) => {
            if (e2) {
              res.writeHead(404);
              return res.end("not found");
            }
            res.writeHead(200, { "Content-Type": MIME[".html"] });
            res.end(d2);
          });
          return;
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(data);
      });
    } catch {
      res.writeHead(500);
      res.end();
    }
  })
  .listen(PORT, () => console.log("akayroom static server listening on :" + PORT));

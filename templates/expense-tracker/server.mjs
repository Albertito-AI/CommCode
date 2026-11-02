import http from 'node:http';
import fs from 'node:fs/promises';
const files = new Map([
  ['/', 'index.html'],
  ['/app.js', 'app.js'],
  ['/expenses.mjs', 'expenses.mjs'],
]);
http
  .createServer(async (req, res) => {
    const name = files.get(new URL(req.url, 'http://localhost').pathname);
    if (!name) {
      res.writeHead(404);
      return res.end('Not found');
    }
    try {
      res.writeHead(200, {
        'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript',
      });
      res.end(await fs.readFile(new URL(name, import.meta.url)));
    } catch {
      res.writeHead(500);
      res.end('Cannot read application file');
    }
  })
  .listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0');

// SPDX-License-Identifier: AGPL-3.0-or-later
import http from 'node:http';
import { run } from './process.mjs';

// Fixed transport code, not a model/repository command. Requests stay on container loopback.
const TRANSPORT = `
const response = await fetch('http://127.0.0.1:8080' + process.argv[1], {
  method: process.argv[2], redirect: 'manual', signal: AbortSignal.timeout(7000)
});
let size = 0; const chunks = [];
if(response.body) for await(const chunk of response.body) {
  size += chunk.length; if(size > 4194304) throw Error('Response exceeds 4 MiB');
  chunks.push(Buffer.from(chunk));
}
console.log(JSON.stringify({status:response.status,
  type:response.headers.get('content-type') || 'application/octet-stream',
  body:Buffer.concat(chunks).toString('base64')}));
`;

export async function dockerPreview(name) {
  let active = 0;
  const relay = http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method) || !req.url.startsWith('/') || active >= 4) {
      res.writeHead(429);
      return res.end('Preview request rejected.');
    }
    active++;
    try {
      const result = await run(
        'docker',
        ['exec', name, 'node', '--input-type=module', '-e', TRANSPORT, '--', req.url, req.method],
        { timeout: 9000, limit: 6 * 1024 * 1024 },
      );
      if (result.code !== 0 || result.truncated || result.timedOut)
        throw Error('Container HTTP request failed');
      const data = JSON.parse(result.output);
      if (
        !Number.isInteger(data.status) ||
        data.status < 200 ||
        data.status > 599 ||
        typeof data.type !== 'string' ||
        data.type.length > 256 ||
        typeof data.body !== 'string'
      )
        throw Error('Invalid container response');
      res.writeHead(data.status, {
        'Content-Type': data.type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(data.body, 'base64'));
    } catch {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Container preview unavailable. Inspect application logs.');
    } finally {
      active--;
    }
  });
  relay.requestTimeout = 10000;
  relay.headersTimeout = 5000;
  relay.maxConnections = 8;
  await new Promise((resolve, reject) => {
    relay.once('error', reject);
    relay.listen(0, '127.0.0.1', resolve);
  });
  return { relay, port: relay.address().port };
}

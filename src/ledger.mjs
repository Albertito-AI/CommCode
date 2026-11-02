// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { hash, redact } from './security.mjs';

export class Ledger {
  constructor(root, secrets = []) {
    this.path = path.join(root, 'events.jsonl');
    this.secrets = secrets;
    this.queue = Promise.resolve();
  }
  async read() {
    const raw = await fs.readFile(this.path, 'utf8').catch((e) => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    return raw.trim() ? raw.trim().split('\n').map(JSON.parse) : [];
  }
  append(type, data) {
    const operation = this.queue.then(async () => {
      const events = await this.read();
      const event = {
        sequence: events.length + 1,
        time: new Date().toISOString(),
        type,
        data: JSON.parse(redact(data, this.secrets)),
        previous: events.at(-1)?.hash || '0'.repeat(64),
      };
      event.hash = hash(JSON.stringify(event));
      await fs.appendFile(this.path, JSON.stringify(event) + '\n', { mode: 0o600 });
      return event;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async verify() {
    let previous = '0'.repeat(64),
      sequence = 0;
    for (const event of await this.read()) {
      const { hash: digest, ...payload } = event;
      if (
        payload.sequence !== ++sequence ||
        payload.previous !== previous ||
        hash(JSON.stringify(payload)) !== digest
      )
        return false;
      previous = digest;
    }
    return true;
  }
}

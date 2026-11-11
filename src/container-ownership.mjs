// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs/promises';
import path from 'node:path';
import { Fault, hash } from './security.mjs';
import { run } from './process.mjs';

const PREFIX = 'io.commcode.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTAINER = /^[0-9a-f]{64}$/;

// On a failed removal, confirm absence with a successful daemon inventory.
// A daemon/permission error is not evidence that the resource disappeared.
export async function removeContainer(target, execute = run) {
  const removed = await execute('docker', ['rm', '-f', target], { timeout: 10000 });
  if (removed.code === 0) return;
  const filter = CONTAINER.test(target) ? 'id=' + target : 'name=^/' + target + '$';
  const inventory = await execute('docker', ['ps', '-aq', '--no-trunc', '--filter', filter], {
    timeout: 5000,
  });
  if (inventory.code === 0 && !inventory.output.trim()) return;
  throw new Fault(
    'Could not remove the owned container; it remains available for inspection and retry.',
    503,
  );
}

export class ContainerOwnership {
  static async create(directory, instance, execute = run) {
    return new ContainerOwnership(await fs.realpath(directory), instance, execute);
  }
  constructor(directory, instance, execute) {
    this.directory = directory;
    this.owner = hash(directory);
    this.instance = instance;
    this.execute = execute;
  }
  labels(ws, kind) {
    return Object.entries({
      managed: '1',
      owner: this.owner,
      instance: this.instance,
      workspace: ws.id,
      kind,
    }).flatMap(([key, value]) => ['--label', PREFIX + key + '=' + value]);
  }
  async inspect(ws, container) {
    if (!CONTAINER.test(container)) throw new Fault('Use the complete reviewed container ID.', 409);
    const result = await this.execute('docker', ['inspect', container], { timeout: 5000 });
    if (result.code !== 0)
      throw new Fault(
        'Container could not be inspected. Refresh recovery review before cleanup.',
        409,
      );
    const record = JSON.parse(result.output)[0];
    const labels = record.Config?.Labels || {};
    const instance = labels[PREFIX + 'instance'];
    const kind = labels[PREFIX + 'kind'];
    const name = record.Name?.slice(1);
    const operation = name?.slice(('pw-' + kind + '-' + instance + '-').length);
    const source = await fs.realpath(ws.root);
    const mount = record.Mounts?.filter((item) => item.Destination === '/workspace');
    const owned =
      record.Id === container &&
      labels[PREFIX + 'managed'] === '1' &&
      labels[PREFIX + 'owner'] === this.owner &&
      labels[PREFIX + 'workspace'] === ws.id &&
      UUID.test(instance || '') &&
      ['app', 'job'].includes(kind) &&
      UUID.test(operation || '') &&
      name === 'pw-' + kind + '-' + instance + '-' + operation &&
      path.dirname(path.dirname(source)) === this.directory &&
      mount?.length === 1 &&
      mount[0].Type === 'bind' &&
      mount[0].Source === source;
    return {
      id: container,
      name,
      running: record.State?.Running === true,
      finding: !owned
        ? 'ownership_mismatch'
        : instance === this.instance
          ? 'current_instance'
          : 'prior_instance',
      cleanupAllowed: owned && instance !== this.instance,
    };
  }
  async inventory(ws) {
    const result = await this.execute(
      'docker',
      [
        'ps',
        '-aq',
        '--no-trunc',
        '--filter',
        'label=' + PREFIX + 'managed=1',
        '--filter',
        'label=' + PREFIX + 'owner=' + this.owner,
        '--filter',
        'label=' + PREFIX + 'workspace=' + ws.id,
      ],
      { timeout: 5000 },
    );
    if (result.code !== 0)
      throw new Fault(
        'Docker ownership inventory is unavailable. No containers were changed.',
        503,
      );
    const ids = result.output.trim().split(/\s+/).filter(Boolean);
    if (ids.length > 100)
      throw new Fault('Container inventory exceeds 100 entries; inspect Docker directly.', 409);
    const resources = [];
    for (const container of ids) resources.push(await this.inspect(ws, container));
    return resources;
  }
  async cleanup(ws, container) {
    const reviewed = await this.inspect(ws, container);
    if (!reviewed.cleanupAllowed)
      throw new Fault('Cleanup refused: this is a current-instance or mismatched container.', 409);
    await removeContainer(reviewed.id, this.execute);
    return { removed: reviewed.id };
  }
}

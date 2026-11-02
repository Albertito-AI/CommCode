// Run only after authenticating gh locally and reviewing the source.
import { spawnSync } from 'node:child_process';
function command(bin, args, capture = false) {
  const r = spawnSync(bin, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (r.status !== 0)
    throw Error(
      `${bin} ${args[0]} failed. No force-push or credential recovery will be attempted.`,
    );
  return r.stdout?.trim();
}
if (!process.argv.includes('--publish'))
  throw Error('Review this script, authenticate gh, then run node scripts/publish.mjs --publish.');
const owner = command('gh', ['api', 'user', '--jq', '.login'], true);
if (owner !== 'Albertito-AI')
  throw Error('The authenticated account is not the intended owner Albertito-AI.');
if (command('git', ['status', '--porcelain'], true))
  throw Error('Commit reviewed source before publishing.');
command('npm', ['run', 'verify']);
command('npm', ['run', 'format:check']);
command('gh', [
  'repo',
  'create',
  'Albertito-AI/CommCode',
  '--public',
  '--description',
  'Open-source software creation for the public good. Local-first, inspectable and user-owned.',
  '--source=.',
  '--remote=origin',
  '--push',
]);
console.log(
  'Repository created and source pushed. Inspect GitHub Actions before tagging a release.',
);

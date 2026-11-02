import fs from 'node:fs/promises';
const lock = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
let output =
  '# Third-party notices\n\nCommCode platform code: AGPL-3.0-or-later. Starter templates: CC0-1.0.\nNode.js, Python, Git and Docker are separately installed upstream tools.\n\nThe following installed npm components are used in the editor or build toolchain.\nOptional packages for other architectures remain documented by package-lock.json.\nTheir licences travel with those packages when installed.\n';
for (const [dir, info] of Object.entries(lock.packages)) {
  if (!dir) continue;
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    continue;
  }
  const name = dir.replace(/^node_modules\//, '');
  output += `\n## ${name} ${info.version}\n\nLicence identifier: ${info.license || 'See included licence text'}.\n`;
  const licences = names.filter((n) => /^(LICENSE|LICENCE|COPYING)(\.|$)/i.test(n));
  for (const file of licences)
    output += '\n```text\n' + (await fs.readFile(dir + '/' + file, 'utf8')).trim() + '\n```\n';
  if (!licences.length)
    output +=
      '\nNo standalone licence file in this installed package; consult its package metadata and upstream source.\n';
}
await fs.writeFile('THIRD_PARTY_NOTICES.md', output);

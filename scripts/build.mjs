import { build } from 'esbuild';
await build({
  entryPoints: ['web/editor-entry.js'],
  outfile: 'web/editor.js',
  bundle: true,
  format: 'esm',
  minify: true,
  legalComments: 'eof',
  target: ['es2022'],
});
console.log('Bundled the local CodeMirror editor. No CDN dependency.');

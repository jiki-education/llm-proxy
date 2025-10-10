import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/bundle.js',
  format: 'esm',
  external: ['@google/generative-ai'],
  sourcemap: true
});

console.log('Bundle created successfully!');

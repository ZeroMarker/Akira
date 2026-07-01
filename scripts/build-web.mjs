import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive: true });
await cp('data', 'dist/data', { recursive: true });
await cp('node_modules/js-yaml/dist/js-yaml.min.js', 'dist/vendor/js-yaml.min.js');

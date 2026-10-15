import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'www');
const folders = ['assets', 'audio', 'data', 'resources'];
const files = ['index.html', 'manifest.json', 'offline.html', 'service-worker.js'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) await cp(join(root, file), join(output, file));
for (const folder of folders) await cp(join(root, folder), join(output, folder), { recursive: true });
// Capacitor's local WebView does not need the PWA worker; static assets are bundled into the app.
await writeFile(join(output, 'CAPACITOR_BUILD.txt'), `Generated from ${root}\n`);
console.log(`Prepared ${relative(root, output)} for Capacitor.`);

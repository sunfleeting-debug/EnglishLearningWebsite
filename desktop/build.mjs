/*
 * 打包前准备：把站点白名单资源从仓库根拷到 desktop/app/（electron-builder 的 files
 * 不能引用项目目录外的路径）。每次打包重新生成，输出目录已在 .gitignore。
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(import.meta.dirname, 'app'); // node 22+ 支持 import.meta.dirname
const folders = ['assets', 'audio', 'data', 'resources'];
const files = ['index.html', 'manifest.json', 'offline.html', 'service-worker.js'];

for (const p of [...folders.map(f => join(root, f)), ...files.map(f => join(root, f))]) {
  await stat(p); // 缺文件直接抛错，别打出一个残缺包
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of files) await cp(join(root, file), join(out, file));
for (const folder of folders) await cp(join(root, folder), join(out, folder), { recursive: true });
console.log(`Prepared ${relative(root, out)} for Electron packaging.`);

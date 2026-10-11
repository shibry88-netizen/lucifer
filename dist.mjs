/* 把单文件应用 + PWA 资源整理成 dist/，供 Tauri / Electron / Capacitor 打包 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
execSync('node build.mjs', { cwd: root, stdio: 'inherit' });

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png']) {
  fs.copyFileSync(path.join(root, f), path.join(dist, f === 'index.html' ? 'index.html' : f));
}
console.log('OK dist ->', fs.readdirSync(dist).join(', '));

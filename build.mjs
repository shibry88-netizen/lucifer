import fs from 'node:fs';
import path from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const src = path.join(root, 'src');

const css = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
const js1 = fs.readFileSync(path.join(src, 'app.part1.js'), 'utf8');
const js2 = fs.readFileSync(path.join(src, 'app.part2.js'), 'utf8');
const js = js1 + '\n\n' + js2;

// 语法自检
new Function(js); // 会在语法错误时抛错

const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
const out = shell
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);

fs.writeFileSync(path.join(root, 'index.html'), out, 'utf8');
fs.writeFileSync(path.join(root, 'src', 'app.js'), js, 'utf8');

console.log('OK build ->', (out.length / 1024).toFixed(1) + ' KB');

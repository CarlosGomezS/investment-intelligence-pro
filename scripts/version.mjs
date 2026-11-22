// Añade ?v=<versión> a todos los imports y a los recursos de index.html para que el navegador
// (o la app empaquetada) nunca mezcle archivos de versiones distintas. Ejecutar antes de cada publicación:
//   node scripts/version.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })('js');
const strip = (s) => s.replace(/(\.js|\.css)\?v=[a-z0-9]+/g, '$1');
const h = createHash('sha1');
for (const f of [...files.sort(), 'css/app.css']) h.update(strip(readFileSync(f, 'utf8')));
const v = h.digest('hex').slice(0, 8);
for (const f of files) {
  const s = strip(readFileSync(f, 'utf8')).replace(/(from\s+'|import\(\s*')(\.{1,2}\/[^']+?\.js)'/g, `$1$2?v=${v}'`);
  writeFileSync(f, s);
}
let html = strip(readFileSync('index.html', 'utf8'));
html = html.replace('href="css/app.css"', `href="css/app.css?v=${v}"`).replace('src="js/app.js"', `src="js/app.js?v=${v}"`).replace(/data-version="[^"]*"/, `data-version="${v}"`);
writeFileSync('index.html', html);
console.log('versión', v);

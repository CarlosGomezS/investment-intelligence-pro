// Comprueba la sintaxis de todos los archivos JS de la app (evita publicar un archivo roto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
test('todos los .js tienen sintaxis válida', () => {
  for (const f of [...walk('js'), 'worker/worker.js']) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { assert.fail(`${f}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); }
  }
});

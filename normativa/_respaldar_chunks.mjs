/**
 * _respaldar_chunks.mjs -- SOLO LECTURA. Baja a disco las filas de
 * normativa_chunks de las fuentes indicadas, EMBEDDINGS INCLUIDOS, para poder
 * revertir un re-indexado.
 *
 * Uso:
 *   node --env-file=.env.supabase.local normativa/_respaldar_chunks.mjs OGUC LGUC
 *
 * El archivo sale a normativa/_respaldos/chunks_<fuentes>_<fecha>.json y esta
 * gitignoreado: son datos de produccion, no van al repo publico.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET || process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('Faltan SUPABASE_URL / SUPABASE_SECRET.'); process.exit(1); }

const fuentes = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!fuentes.length) { console.error('Indica al menos una fuente, ej: OGUC LGUC'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const filtro = `fuente=in.(${fuentes.join(',')})`;

const todas = [];
for (let off = 0; ; off += 200) {
  const r = await fetch(
    `${URL}/rest/v1/normativa_chunks?${filtro}&select=*&order=id&limit=200&offset=${off}`,
    { headers: H });
  if (!r.ok) { console.error('Error:', r.status, await r.text()); process.exit(1); }
  const lote = await r.json();
  todas.push(...lote);
  process.stdout.write(`  ${todas.length} filas...\r`);
  if (lote.length < 200) break;
}

const dir = join(__dir, '_respaldos');
mkdirSync(dir, { recursive: true });
const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const ruta = join(dir, `chunks_${fuentes.join('-')}_${sello}.json`);
writeFileSync(ruta, JSON.stringify({
  _que_es: 'Respaldo completo de filas de normativa_chunks previo a un re-indexado.',
  fuentes,
  fecha: new Date().toISOString(),
  total: todas.length,
  filas: todas,
}, null, 1), 'utf-8');

const conEmb = todas.filter(f => f.embedding).length;
console.log(`\nrespaldadas ${todas.length} filas (${conEmb} con embedding)`);
console.log(ruta);

/**
 * _estado_db.mjs -- SOLO LECTURA. Fotografia del estado de normativa_chunks.
 *
 * Existe para poder decidir un re-indexado con datos, no de memoria: cuantas
 * filas hay por fuente, cuantas tienen embedding y que forma tiene el campo
 * `metadata` (que es donde vive la taxonomia de 7 dimensiones y es justo lo
 * que un re-indexado ingenuo pisaria).
 *
 * Uso: node --env-file=.env.supabase.local normativa/_estado_db.mjs
 */
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET || process.env.SUPABASE_KEY;
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SECRET en el entorno.');
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function contar(filtro = '') {
  const r = await fetch(`${URL}/rest/v1/normativa_chunks?select=id${filtro}`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const cr = r.headers.get('content-range') || '';
  return Number(cr.split('/')[1] || 0);
}

const total = await contar();
const conEmb = await contar('&embedding=not.is.null');
console.log('filas totales        :', total);
console.log('con embedding        :', conEmb);
console.log('SIN embedding        :', total - conEmb);

// por fuente, paginando
const porFuente = {};
for (let off = 0; off < total; off += 1000) {
  const r = await fetch(`${URL}/rest/v1/normativa_chunks?select=fuente&limit=1000&offset=${off}`, { headers: H });
  for (const x of await r.json()) porFuente[x.fuente] = (porFuente[x.fuente] || 0) + 1;
}
console.log('\npor fuente:');
for (const [k, v] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(5), k);
}

// forma del metadata: que claves aparecen y en cuantas filas
const claves = {};
let muestra = null;
for (let off = 0; off < total; off += 1000) {
  const r = await fetch(`${URL}/rest/v1/normativa_chunks?select=codigo,metadata&limit=1000&offset=${off}`, { headers: H });
  for (const x of await r.json()) {
    if (!x.metadata) { claves['(sin metadata)'] = (claves['(sin metadata)'] || 0) + 1; continue; }
    if (!muestra && Object.keys(x.metadata).length > 3) muestra = x;
    for (const k of Object.keys(x.metadata)) claves[k] = (claves[k] || 0) + 1;
  }
}
console.log('\nclaves de metadata (filas en que aparece cada una):');
for (const [k, v] of Object.entries(claves).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(5), k);
}
if (muestra) {
  console.log('\nmuestra de metadata (' + muestra.codigo + '):');
  console.log('  ' + JSON.stringify(muestra.metadata));
}

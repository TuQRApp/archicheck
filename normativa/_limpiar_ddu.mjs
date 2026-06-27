/**
 * Elimina chunks DDU que NO pertenecen a las 10 circulares estructuradas.
 * Mantiene: DDU-172, 176, 186, 200, 201, 157, 912, 1022, 351, 447
 */
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const H   = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const KEEP = ['DDU-172-', 'DDU-176-', 'DDU-186-', 'DDU-200-', 'DDU-201-',
              'DDU-157-', 'DDU-912-', 'DDU-1022-', 'DDU-351-', 'DDU-447-'];

// 1. Contar DDU total
const r0 = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.DDU&select=id`,
  { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
const totalDDU = r0.headers.get('content-range')?.split('/')[1];
console.log(`DDU total antes: ${totalDDU}`);

// 2. Obtener todos los códigos DDU
const rAll = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.DDU&select=codigo&limit=2000`, { headers: H });
const allDDU = await rAll.json();
console.log(`DDU obtenidos: ${allDDU.length}`);

// 3. Clasificar
const toKeep   = allDDU.filter(r => KEEP.some(p => r.codigo?.startsWith(p)));
const toDelete = allDDU.filter(r => !KEEP.some(p => r.codigo?.startsWith(p)));
console.log(`Mantener: ${toKeep.length} | Eliminar: ${toDelete.length}`);

if (toDelete.length === 0) { console.log('Nada que eliminar.'); process.exit(0); }

// 4. Borrar en lotes de 100 via código exacto
const codes = toDelete.map(r => r.codigo);
let deleted = 0;
for (let i = 0; i < codes.length; i += 100) {
  const batch = codes.slice(i, i + 100);
  const q = batch.map(c => `codigo.eq.${encodeURIComponent(c)}`).join(',');
  const del = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.DDU&or=(${q})`, {
    method: 'DELETE',
    headers: { ...H, 'Prefer': 'return=minimal' },
  });
  if (!del.ok) {
    console.error(`Error en lote ${i}-${i+100}:`, del.status, await del.text());
  } else {
    deleted += batch.length;
    process.stdout.write(`\rEliminados: ${deleted}/${toDelete.length}`);
  }
}
console.log('\nListo.');

// 5. Contar DDU después
const r1 = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.DDU&select=id`,
  { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
console.log(`DDU total después: ${r1.headers.get('content-range')?.split('/')[1]}`);

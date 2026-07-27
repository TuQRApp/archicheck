/**
 * Revisa chunks específicos que deberían aparecer pero no aparecen,
 * y detecta chunks DDU inesperados en la DB.
 */
const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

// 1. Ver el texto de LGUC-116 (permiso de edificación — artículo más importante, no aparece)
console.log('=== LGUC-116 ===');
const r1 = await fetch(`${URL}/rest/v1/normativa_chunks?codigo=eq.LGUC-116&select=codigo,titulo,texto`, { headers: H });
const lguc116 = await r1.json();
lguc116.forEach(c => console.log(`${c.codigo}: "${c.texto?.substring(0,300)}"`));

// 2. Ver el texto de OGUC-4.5.7 (iluminación/ventilación — no aparece)
console.log('\n=== OGUC-4.5.7 ===');
const r2 = await fetch(`${URL}/rest/v1/normativa_chunks?codigo=eq.OGUC-4.5.7&select=codigo,titulo,texto`, { headers: H });
const oguc457 = await r2.json();
oguc457.forEach(c => console.log(`${c.codigo}: "${c.texto?.substring(0,300)}"`));

// 3. Ver todos los códigos DDU distintos en la DB (detectar basura)
console.log('\n=== Códigos DDU en DB ===');
const r3 = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.DDU&select=codigo&limit=500`, { headers: H });
const dduRows = await r3.json();
const dduCodigos = [...new Set(dduRows.map(r => r.codigo))].sort();
console.log(`Total chunks DDU: ${dduRows.length}, códigos únicos: ${dduCodigos.length}`);
// Mostrar los que NO son de las 8 circulares indexadas (172, 176, 186, 200, 201, 157, 912, 1022, 351, 447)
const circulares = ['DDU-172','DDU-176','DDU-186','DDU-200','DDU-201','DDU-157','DDU-912','DDU-1022','DDU-351','DDU-447'];
const inesperados = dduCodigos.filter(c => !circulares.some(ci => c.startsWith(ci)));
console.log('Chunks DDU inesperados:', inesperados.length > 0 ? inesperados.join(', ') : 'ninguno');

// 4. Contar chunks por fuente (estado actual completo)
console.log('\n=== Estado actual de la DB ===');
const r4 = await fetch(`${URL}/rest/v1/normativa_chunks?select=fuente&limit=5000`, { headers: H });
const allRows = await r4.json();
const cnt = {};
allRows.forEach(x => cnt[x.fuente] = (cnt[x.fuente] || 0) + 1);
Object.entries(cnt).sort((a,b) => b[1]-a[1]).forEach(([f,n]) => console.log(`  ${f}: ${n}`));
console.log(`  TOTAL: ${allRows.length}`);

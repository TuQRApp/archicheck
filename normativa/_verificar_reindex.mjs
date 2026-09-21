/**
 * _verificar_reindex.mjs -- SOLO LECTURA. Comprueba que el re-indexado dejo en
 * Supabase el corpus corregido y no el viejo.
 *
 * Uso: node --env-file=.env.supabase.local normativa/_verificar_reindex.mjs
 */
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET || process.env.SUPABASE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function filas(query) {
  const r = await fetch(`${URL}/rest/v1/normativa_chunks?${query}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

let fallas = 0;
const ok = (cond, msg, extra = '') => {
  if (!cond) fallas++;
  console.log(`  ${cond ? 'OK  ' : 'FALLA'} ${msg}${extra ? '  -> ' + extra : ''}`);
};

console.log('1. La marginalia de decreto no debe existir en OGUC/LGUC');
const sucios = await filas(
  'fuente=in.(OGUC,LGUC)&texto=ilike.*Decreto%2075%2C%20VIVIENDA*&select=codigo&limit=5');
ok(sucios.length === 0, `chunks con "Decreto 75, VIVIENDA": ${sucios.length}`,
   sucios.map(x => x.codigo).join(' '));

console.log('\n2. Los articulos bis/ter recuperados deben estar');
for (const cod of ['OGUC-2.1.3 bis', 'OGUC-2.2.5 bis', 'LGUC-116 bis', 'LGUC-116 bis A', 'LGUC-2 bis']) {
  const f = await filas(`codigo=eq.${encodeURIComponent(cod)}&select=codigo,texto`);
  ok(f.length > 0, cod, f.length ? f[0].texto.slice(0, 55).replace(/\s+/g, ' ') + '...' : 'NO ESTA');
}

console.log('\n3. Contenido que antes se perdia o llegaba sucio');
const pasillo = await filas('codigo=eq.OGUC-4.2.18&select=texto');
ok(pasillo.length > 0 && /ancho mínimo de 1,10 m/.test(pasillo[0].texto),
   'Art. 4.2.18 trae el minimo de 1,10 m sin ruido en medio');
const carga = await filas('fuente=eq.OGUC&texto=ilike.*TABLA%20DE%20CARGOS%20DE%20OCUPACION*&select=codigo');
ok(carga.length > 0, 'la TABLA DE CARGOS DE OCUPACION esta indexada', carga.map(x => x.codigo).join(' '));
const fuego = await filas('fuente=eq.OGUC&texto=ilike.*F-180*&select=codigo');
ok(fuego.length > 0, 'la matriz de resistencia al fuego esta indexada', carga.length ? fuego.map(x => x.codigo).join(' ') : '');

console.log('\n4. Las otras fuentes no se tocaron');
for (const [f, n] of [['PRC-PRV', 281], ['DDU', 185], ['LEY19300', 128]]) {
  const r = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.${f}&select=id`,
    { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } });
  const tot = Number((r.headers.get('content-range') || '').split('/')[1] || 0);
  ok(tot === n, `${f}: ${tot} filas (esperado ${n})`);
}

console.log(fallas === 0 ? '\nTodo OK.' : `\n${fallas} verificacion(es) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);

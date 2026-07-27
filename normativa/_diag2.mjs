const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;
const OKEY = process.env.OPENAI_API_KEY;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

// 1. Cuántos rows tienen embedding no-nulo
const r1 = await fetch(`${URL}/rest/v1/normativa_chunks?embedding=not.is.null&select=id`,
  { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
console.log('Rows con embedding:', r1.headers.get('content-range'));

// 2. Cuántos rows tienen embedding nulo
const r2 = await fetch(`${URL}/rest/v1/normativa_chunks?embedding=is.null&select=id`,
  { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
console.log('Rows SIN embedding:', r2.headers.get('content-range'));

// 3. Llamar match_normativa con count=1000 y embedding cero (dummy)
const zeroEmb = new Array(1536).fill(0.001);
const r3 = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query_embedding: zeroEmb, match_count: 1000 }),
});
const res3 = await r3.json();
console.log('match_normativa(count=1000):', Array.isArray(res3) ? `${res3.length} resultados` : JSON.stringify(res3));

// 4. Embedding real de query PRC y llamar con count=100
const qResp = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${OKEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: 'coeficiente constructibilidad altura máxima zona Providencia' }),
});
const qEmb = (await qResp.json()).data[0].embedding;

const r4 = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query_embedding: qEmb, match_count: 100 }),
});
const res4 = await r4.json();
console.log('match_normativa(query PRC, count=100):', Array.isArray(res4) ? `${res4.length} resultados` : JSON.stringify(res4));
if (Array.isArray(res4)) {
  const prc = res4.filter(r => r.fuente === 'PRC-PRV');
  console.log('  PRC-PRV en resultados:', prc.length);
  console.log('  Top 5:', res4.slice(0,5).map(r => `[${r.similarity?.toFixed(3)}] ${r.codigo}`).join('\n    '));
}

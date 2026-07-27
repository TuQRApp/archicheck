/**
 * Calcula manualmente la similitud coseno entre la query y los chunks PRC.
 * Si la similitud es alta pero no aparece en match_normativa → problema de índice.
 * Si la similitud es baja → problema de calidad de embedding.
 */
const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;
const OKEY = process.env.OPENAI_API_KEY;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// 1. Obtener embedding de la query
const qResp = await fetch('https://api.openai.com/v1/embeddings', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${OKEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'text-embedding-3-small', input: 'coeficiente constructibilidad altura máxima zona Providencia' }),
});
const qEmb = (await qResp.json()).data[0].embedding;
console.log('Query embedding OK:', qEmb.length, 'dims');

// 2. Obtener algunos chunks PRC-PRV-ZONA con su embedding
const r = await fetch(`${URL}/rest/v1/normativa_chunks?fuente=eq.PRC-PRV&codigo=like.PRC-PRV-ZONA-%25&select=codigo,titulo,embedding&limit=5`, { headers: H });
const zonas = await r.json();
console.log(`\nZonas encontradas: ${zonas.length}`);

for (const z of zonas) {
  if (!z.embedding) { console.log(z.codigo, '— SIN EMBEDDING'); continue; }
  // El embedding viene como string "[0.1, 0.2, ...]" — parsear
  const emb = typeof z.embedding === 'string' ? JSON.parse(z.embedding) : z.embedding;
  const sim = cosine(qEmb, emb);
  console.log(`${z.codigo}: similitud manual = ${sim.toFixed(4)}`);
}

// 3. Ver cuántos results devuelve match_normativa con esta query
const r2 = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query_embedding: qEmb, match_count: 50 }),
});
const results = await r2.json();
console.log(`\nmatch_normativa devuelve: ${Array.isArray(results) ? results.length : JSON.stringify(results)} resultados`);
if (Array.isArray(results)) {
  const prc = results.filter(r => r.codigo?.startsWith('PRC-PRV'));
  console.log(`PRC-PRV en resultados: ${prc.length}`);
  console.log('Top 5:', results.slice(0,5).map(r => `[${r.similarity?.toFixed(3)}] ${r.codigo}`).join('\n  '));
}

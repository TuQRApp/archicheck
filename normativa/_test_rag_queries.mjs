const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;
const OKEY = process.env.OPENAI_API_KEY;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OKEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  return (await r.json()).data[0].embedding;
}

// Queries exactas que usa el worker (texto del mensaje de usuario)
const QUERIES = [
  'El pasillo de circulación mide 1.05 m de ancho. ¿Cumple la normativa chilena para un edificio de oficinas?',
  'Proyecto de edificio en Providencia, zona EC3. ¿Cuál es el coeficiente de constructibilidad máximo y la altura permitida?',
  '¿Qué documentos se necesitan para solicitar un permiso de edificación en la DOM?',
];

for (const q of QUERIES) {
  console.log(`\nQuery: "${q.substring(0, 70)}..."`);
  const emb = await embed(q);
  const r = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ query_embedding: emb, match_count: 25 }),
  });
  const chunks = await r.json();
  if (!Array.isArray(chunks)) { console.log('ERROR:', JSON.stringify(chunks)); continue; }

  const above045 = chunks.filter(c => c.similarity > 0.45);
  const prc = chunks.filter(c => c.fuente === 'PRC-PRV');
  console.log(`  Total: ${chunks.length} | >0.45: ${above045.length} | PRC-PRV: ${prc.length}`);
  console.log(`  Top 5:`);
  chunks.slice(0, 5).forEach(c => console.log(`    [${c.similarity.toFixed(3)}] ${c.fuente} — ${c.codigo}`));
  if (prc.length > 0) {
    console.log(`  PRC results: ${prc.map(c => `[${c.similarity.toFixed(3)}] ${c.codigo}`).join(', ')}`);
  }
}

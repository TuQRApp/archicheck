const URL  = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_KEY;
const H    = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

// Ver los 14 resultados del dummy embedding
const zeroEmb = new Array(1536).fill(0.001);
const r = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query_embedding: zeroEmb, match_count: 1000 }),
});
const res = await r.json();
console.log(`Total resultados: ${Array.isArray(res) ? res.length : 'ERROR: ' + JSON.stringify(res)}`);
if (Array.isArray(res)) {
  // Agrupar por fuente
  const byFuente = {};
  res.forEach(r => { byFuente[r.fuente] = (byFuente[r.fuente] || 0) + 1; });
  console.log('Por fuente:', JSON.stringify(byFuente));
  console.log('\nTodos los códigos:');
  res.forEach(r => console.log(`  [${r.similarity?.toFixed(4)}] ${r.fuente} — ${r.codigo}`));
}

// Probar llamando sin el parámetro fuentes explícitamente nulo
console.log('\n--- Con fuentes: null explícito ---');
const r2 = await fetch(`${URL}/rest/v1/rpc/match_normativa`, {
  method: 'POST',
  headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query_embedding: zeroEmb, match_count: 1000, fuentes: null }),
});
const res2 = await r2.json();
console.log(`Total: ${Array.isArray(res2) ? res2.length : JSON.stringify(res2)}`);

/**
 * _calibrar_threshold.mjs — Prueba queries reales y muestra distribución de similitudes.
 * Uso: node _calibrar_threshold.mjs
 */
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir      = dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const QUERIES = [
  { q: 'ancho mínimo corredor vía evacuación escalera', esperado: ['OGUC-4.2.5', 'OGUC-4.2.4', 'OGUC-4.2.2'] },
  { q: 'permiso de edificación requisitos documentos DOM', esperado: ['LGUC-116', 'LGUC-118', 'DDU 172'] },
  { q: 'coeficiente constructibilidad altura máxima zona Providencia', esperado: ['PRC-PRV-ZONA-EC3', 'PRC-PRV-ZONA-EA5'] },
  { q: 'iluminación ventilación natural local habitable superficie ventana', esperado: ['OGUC-4.5.7', 'OGUC-4.5.1'] },
  { q: 'accesibilidad universal rampas ascensores discapacidad', esperado: ['DDU 351', 'OGUC-4.1.7'] },
  { q: 'subdivisión predial loteo superficie mínima', esperado: ['DDU 200', 'OGUC-3.1.1'] },
  { q: 'rasante distanciamiento adosamiento muro medianero', esperado: ['OGUC-2.6.1', 'OGUC-2.6.3'] },
  { q: 'aportes espacio público cesión terreno municipalidad', esperado: ['DDU 447', 'LGUC-70'] },
];

async function embed(text) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  });
  return (await r.json()).data[0].embedding;
}

async function search(embedding, count = 25) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_normativa`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: embedding, match_count: count }),
  });
  return r.json();
}

console.log('=== Calibración de similarity threshold ===\n');

const stats = { hits_0_5: 0, hits_0_4: 0, hits_0_3: 0, hits_0_2: 0, total: 0 };

for (const { q, esperado } of QUERIES) {
  console.log(`Query: "${q}"`);
  console.log(`Esperado: ${esperado.join(', ')}`);

  const emb = await embed(q);
  const results = await search(emb, 25);

  if (!Array.isArray(results)) { console.log('  ERROR:', JSON.stringify(results)); continue; }

  const top10 = results.slice(0, 10);
  console.log('  Top 10 resultados:');
  top10.forEach((r, i) => {
    const sim = r.similarity.toFixed(3);
    const match = esperado.some(e => r.codigo?.includes(e.replace('DDU ', 'DDU-')) || r.titulo?.includes(e));
    console.log(`  ${i+1}. [${sim}] ${r.codigo} — ${(r.titulo||'').substring(0,50)}${match ? ' ✓' : ''}`);
  });

  // Encontrar similitud del primer resultado esperado
  for (const exp of esperado) {
    const found = results.find(r => r.codigo?.includes(exp.replace('DDU ', 'DDU-')) || r.titulo?.includes(exp));
    if (found) {
      const sim = found.similarity;
      stats.total++;
      if (sim >= 0.5) stats.hits_0_5++;
      if (sim >= 0.4) stats.hits_0_4++;
      if (sim >= 0.3) stats.hits_0_3++;
      if (sim >= 0.2) stats.hits_0_2++;
      console.log(`  → ${exp} encontrado con similarity: ${sim.toFixed(3)}`);
    } else {
      console.log(`  → ${exp}: NO ENCONTRADO en top 25`);
    }
  }
  console.log();
}

console.log('=== Resumen ===');
console.log(`Resultados esperados encontrados:`);
console.log(`  threshold 0.5: ${stats.hits_0_5}/${stats.total}`);
console.log(`  threshold 0.4: ${stats.hits_0_4}/${stats.total}`);
console.log(`  threshold 0.3: ${stats.hits_0_3}/${stats.total}`);
console.log(`  threshold 0.2: ${stats.hits_0_2}/${stats.total}`);
console.log(`\nRecomendación: usar el threshold donde recall sea alto sin incluir demasiado ruido.`);

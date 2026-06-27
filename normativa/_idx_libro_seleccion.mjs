/**
 * _idx_libro_seleccion.mjs
 * 1. Borra chunks de página del Libro (codigo like DDU-%-p%)
 * 2. Indexa las secciones estructuradas de ddu_libro_seleccion.json
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir        = dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
};

// 1. Borrar chunks de página del Libro (patron: DDU-<numero>-p<pagina>)
console.log('Borrando chunks de página del Libro (DDU-*-p*)...');
const delResp = await fetch(
  `${SUPABASE_URL}/rest/v1/normativa_chunks?fuente=eq.DDU&codigo=like.DDU-%25-p%25`,
  { method: 'DELETE', headers: { ...headers, 'Prefer': 'return=minimal' } }
);
if (!delResp.ok) {
  console.error('Error al borrar:', await delResp.text());
  process.exit(1);
}
console.log('  Chunks de página eliminados.');

// 2. Cargar JSON estructurado
const json   = JSON.parse(readFileSync(join(__dir, 'nacional/ddu_libro_seleccion.json'), 'utf-8'));
const chunks = json.secciones
  .filter(s => s.texto && s.texto.trim().length > 30)
  .map(s => {
    // Extraer número de circular del codigo (DDU-172-s1 → "172")
    const numMatch = s.codigo.match(/^DDU-(\d+)-s/);
    const numDDU = numMatch ? numMatch[1] : 'LIBRO';
    return {
      fuente:   'DDU',
      codigo:   s.codigo,
      titulo:   s.titulo || '',
      texto:    s.texto.trim().substring(0, 6500),
      metadata: { ddu: numDDU, fuente_doc: 'Libro DDU Circulares' },
    };
  });

console.log(`Indexando ${chunks.length} chunks estructurados...`);

// 3. Embeddings + upsert en lotes de 50
for (let i = 0; i < chunks.length; i += 50) {
  const lote = chunks.slice(i, i + 50);

  const emb = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: lote.map(c => `${c.titulo}\n${c.texto}`.substring(0, 8000)),
    }),
  });
  const embJson = await emb.json();
  if (embJson.error) { console.error('OpenAI error:', embJson.error); process.exit(1); }

  const filas = lote.map((c, j) => ({ ...c, embedding: embJson.data[j].embedding }));

  const up = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?on_conflict=codigo`, {
    method:  'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body:    JSON.stringify(filas),
  });
  if (!up.ok) { console.error(`Error upsert lote ${i}:`, await up.text()); }
  else { console.log(`  ${Math.min(i + 50, chunks.length)}/${chunks.length} OK`); }
}

console.log('\nDDU Libro seleccion indexada.');

/**
 * Re-indexa DDU 447 en Supabase.
 * Primero borra los chunks viejos (DDU-447-*), luego sube los nuevos.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir        = dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const headers = {
  'apikey':        SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
};

// 1. Borrar chunks viejos del DDU 447
console.log('Borrando chunks DDU-447-* existentes...');
const del = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?codigo=like.DDU-447-*&fuente=eq.DDU`, {
  method: 'DELETE',
  headers: { ...headers, 'Prefer': 'return=minimal' },
});
if (!del.ok) { console.error('Error al borrar:', await del.text()); process.exit(1); }
console.log('  Chunks viejos eliminados.');

// 2. Cargar JSON nuevo
const json   = JSON.parse(readFileSync(join(__dir, 'nacional/ddu_447.json'), 'utf-8'));
const chunks = json.secciones
  .filter(s => s.texto && s.texto.trim().length > 20)
  .map(s => ({
    fuente:   'DDU',
    codigo:   s.codigo,
    titulo:   s.titulo || '',
    texto:    s.texto.trim().substring(0, 6500),
    metadata: { ddu: '447', titulo_doc: json.titulo },
  }));

console.log(`Indexando ${chunks.length} chunks nuevos...`);

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
  const filas   = lote.map((c, j) => ({ ...c, embedding: embJson.data[j].embedding }));

  const up = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?on_conflict=codigo`, {
    method:  'POST',
    headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
    body:    JSON.stringify(filas),
  });
  if (!up.ok) { console.error(`Error upsert lote ${i}:`, await up.text()); }
  else { console.log(`  ${Math.min(i + 50, chunks.length)}/${chunks.length} OK`); }
}

console.log('DDU 447 re-indexado.');

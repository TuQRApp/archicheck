/**
 * _idx_oguc.mjs
 * 1. Borra chunks OGUC viejos de Supabase
 * 2. Indexa secciones extraídas del PDF (oguc_pdf.json)
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

// 1. Borrar todos los chunks OGUC existentes
console.log('Borrando chunks OGUC existentes...');
const del = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?fuente=eq.OGUC`, {
  method: 'DELETE',
  headers: { ...headers, 'Prefer': 'return=minimal' },
});
if (!del.ok) { console.error('Error al borrar:', await del.text()); process.exit(1); }
console.log('  Chunks OGUC eliminados.');

// 2. Cargar JSON
const json = JSON.parse(readFileSync(join(__dir, 'nacional/oguc_pdf.json'), 'utf-8'));
const chunks = json.secciones
  .filter(s => s.texto && s.texto.trim().length > 30)
  .map(s => ({
    fuente:   'OGUC',
    codigo:   s.codigo,
    titulo:   `Art. ${s.numero} OGUC`,
    texto:    s.texto.trim().substring(0, 6500),
    metadata: { numero: s.numero, decreto: 'DTO-47' },
  }));

console.log(`Indexando ${chunks.length} chunks OGUC...`);

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
  else { process.stdout.write(`  ${Math.min(i + 50, chunks.length)}/${chunks.length}\r`); }
}

console.log(`\nOGUC re-indexado. ${chunks.length} secciones.`);

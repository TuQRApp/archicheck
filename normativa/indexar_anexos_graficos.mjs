/**
 * indexar_anexos_graficos.mjs
 *
 * Indexa en Supabase las transcripciones de `anexos_transcripciones.json`: el
 * contenido normativo que en los PDF oficiales existe SOLO como imagen.
 *
 * POR QUE EXISTE:
 * al re-indexar OGUC y LGUC quedo a la vista que el RAG y el prompt volvian a
 * estar desincronizados, un nivel mas abajo. El prompt ya adjunta los anexos
 * graficos al articulo; el RAG solo tenia el texto. Caso concreto medido: la
 * consulta "angulo de rasante en la Region Metropolitana" NO devolvia el
 * Art. 2.6.3 de la OGUC, porque su texto dice "las rasantes que se indican mas
 * adelante" y el angulo (80/70/60 grados) vive unicamente en la imagen.
 *
 * QUE INDEXA: todo anexo con contenido. Los de tipo `decoracion` (membretes,
 * escudos municipales) se saltan: no son normativa.
 *
 * ES ADITIVO. Borra solo las filas que el propio script haya creado antes
 * (metadata->>'tipo_contenido' = 'anexo_grafico'), nunca las de articulado.
 *
 * Uso:
 *   node --env-file=.env.supabase.local --env-file=.env.openai.local \
 *        normativa/indexar_anexos_graficos.mjs --dry-run
 *   ... --confirmo
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { clasificar } from './clasificar_normativa.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET || process.env.SUPABASE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const DRY = process.argv.includes('--dry-run');
const OK = process.argv.includes('--confirmo');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const LOTE = 50;

/** Corpus del anexo -> valor de `fuente` que ya usa la tabla. */
const FUENTE = {
  OGUC: 'OGUC', LGUC: 'LGUC', LEY_19300: 'LEY19300', DDU: 'DDU',
  PRC_PROVIDENCIA: 'PRC-PRV', PRC_SANTIAGO: 'PRC-STGO',
  PRC_NUNOA: 'PRC-NUN', PRC_ISLA_DE_PASCUA: 'PRC-IDP',
};

const tr = JSON.parse(readFileSync(join(__dir, 'anexos_transcripciones.json'), 'utf-8'));

const chunks = [];
const porFuente = {};
for (const a of tr.anexos) {
  if (a.tipo === 'decoracion' || !a.contenido || a.contenido.trim().length < 30) continue;

  // Un anexo se ancla al articulo que documenta. `aplica_a` gana, porque una
  // circular DDU puede documentar un articulo de la OGUC.
  const destino = a.aplica_a || { corpus: a.corpus, articulo: a.articulo };
  const fuente = FUENTE[destino.corpus] || destino.corpus;
  const art = destino.articulo ? String(destino.articulo).trim() : null;
  const codigo = `${fuente}-${art ? art + '-' : ''}anexo-${a.id}`.slice(0, 200);

  // El texto que se embebe lleva el titulo y el articulo: sin eso, una tabla
  // de puros numeros no matchea con ninguna consulta en lenguaje natural.
  const encabezado = art
    ? `Anexo grafico del Art. ${art} (${fuente}) -- ${a.titulo}`
    : `Anexo grafico ${fuente} -- ${a.titulo}`;
  const texto = `${encabezado}\n\n${a.contenido}`.slice(0, 6500);

  const metadataBase = {
    tipo_contenido: 'anexo_grafico',
    anexo_id: a.id,
    tipo_anexo: a.tipo,
    articulo: art,
    fuente_imagen: `${a.pdf} p. ${(a.paginas || []).join(', ')}`,
    procedencia: 'transcripcion de imagen, no capa de texto del PDF',
  };
  const taxonomia = art ? clasificar(fuente, `${fuente}-${art}`, metadataBase) : {};

  chunks.push({ fuente, codigo, titulo: a.titulo, texto, metadata: { ...metadataBase, ...taxonomia } });
  porFuente[fuente] = (porFuente[fuente] || 0) + 1;
}

console.log(`anexos con contenido a indexar: ${chunks.length} de ${tr.anexos.length}`);
for (const [k, v] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(v).padStart(3), k);
}
const conArt = chunks.filter(c => c.metadata.articulo).length;
console.log(`anclados a un articulo: ${conArt} | sin articulo (leyendas de plano, catalogos): ${chunks.length - conArt}`);

if (DRY) {
  console.log('\nEjemplo de texto embebido:\n---');
  console.log(chunks.find(c => c.metadata.articulo === '2.6.3')?.texto.slice(0, 320) || chunks[0].texto.slice(0, 320));
  console.log('---\n--dry-run: no se toco la base.');
  process.exit(0);
}
if (!OK) { console.error('\nVolve con --confirmo para escribir en Supabase.'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) { console.error('Faltan credenciales.'); process.exit(1); }

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// embeddings primero: si OpenAI falla, la base queda intacta
const conEmb = [];
for (let i = 0; i < chunks.length; i += LOTE) {
  const lote = chunks.slice(i, i + LOTE);
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: lote.map(c => c.texto) }),
  });
  if (!r.ok) { console.error('OpenAI', r.status, await r.text()); process.exit(1); }
  const vecs = (await r.json()).data.map(d => d.embedding);
  lote.forEach((c, j) => conEmb.push({ ...c, embedding: vecs[j] }));
  process.stdout.write(`  embeddings ${conEmb.length}/${chunks.length}\r`);
}
console.log(`  embeddings ${conEmb.length}/${chunks.length}  listo`);

// borrar SOLO anexos previos de este script
const del = await fetch(
  `${SUPABASE_URL}/rest/v1/normativa_chunks?metadata->>tipo_contenido=eq.anexo_grafico`,
  { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } });
if (!del.ok) { console.error('Error al borrar anexos previos:', del.status, await del.text()); process.exit(1); }
console.log('  anexos previos borrados (si habia)');

let ins = 0;
for (let i = 0; i < conEmb.length; i += LOTE) {
  const lote = conEmb.slice(i, i + LOTE);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(lote),
  });
  if (!r.ok) { console.error('\nError al insertar:', r.status, await r.text()); process.exit(1); }
  ins += lote.length;
  process.stdout.write(`  insertados ${ins}/${conEmb.length}\r`);
}
console.log(`  insertados ${ins}/${conEmb.length}  listo`);

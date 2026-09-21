/**
 * reindexar_oguc_lguc.mjs
 *
 * Re-indexa en Supabase SOLO las fuentes OGUC y LGUC, desde la extraccion
 * corregida (`nacional/*_pdf.json`), preservando la taxonomia.
 *
 * POR QUE EXISTE, y por que NO se usa indexar_normativa.mjs:
 *
 * 1. El RAG quedo DESINCRONIZADO del prompt. Entre el 2026-09-20 y el 21 la
 *    extraccion de OGUC y LGUC cambio de fondo: se descarto la marginalia de
 *    decretos por posicion (ACH-DATA-014), se recuperaron 45 articulos bis/ter
 *    que se descartaban en silencio (ACH-DATA-008) y se dejo de aplanar las
 *    tablas (ACH-DATA-013). El prompt ya usa el corpus corregido; Supabase
 *    seguia con el viejo, con marginalia intercalada dentro de las oraciones.
 *
 * 2. `indexar_normativa.mjs` NO sirve para esto y por eso tiene un guard:
 *    reindexa TODO, y al hacerlo reinsertaria ~1.144 secciones de DDU sin
 *    curar que hoy no estan (ACH-DATA-001). Este script toca 2 fuentes y
 *    ninguna otra.
 *
 * 3. Los `_idx_*.mjs` tampoco: escriben `metadata: {numero, decreto}` a secas,
 *    asi que borrarian la TAXONOMIA DE 10 CLAVES que hoy tienen las 1.608
 *    filas (zona, canal, ambito, comuna, vigencia, tipo_norma, etapa_pipeline,
 *    vigencia_fecha, tipo_edificacion, clasificacion_metodo). Aca la taxonomia
 *    se recalcula con `clasificar()`, que es la fuente unica compartida con
 *    indexar_normativa.mjs y backfill_metadata.mjs.
 *
 * ANTES DE CORRER: respaldar, porque esto borra filas.
 *   node --env-file=.env.supabase.local normativa/_respaldar_chunks.mjs OGUC LGUC
 *
 * Uso:
 *   node --env-file=.env.supabase.local --env-file=.env.openai.local \
 *        normativa/reindexar_oguc_lguc.mjs --dry-run
 *   node --env-file=.env.supabase.local --env-file=.env.openai.local \
 *        normativa/reindexar_oguc_lguc.mjs --confirmo
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
const MAX_CHARS = 6500;
const SOLAPE = 400;
const LOTE = 50;

const FUENTES = [
  { fuente: 'OGUC', archivo: 'nacional/oguc_pdf.json', decreto: 'DTO-47',
    ley: 'Ordenanza General de Urbanismo y Construcciones (OGUC)' },
  { fuente: 'LGUC', archivo: 'nacional/lguc_pdf.json', decreto: 'DTO-458',
    ley: 'Ley General de Urbanismo y Construcciones' },
];

/** Mismo criterio de fragmentacion que indexar_normativa.mjs. */
function fragmentar(texto, codigo) {
  if (texto.length <= MAX_CHARS) return [{ codigo, texto }];
  const partes = [];
  let i = 0, idx = 1;
  while (i < texto.length) {
    partes.push({ codigo: `${codigo}-pt${idx}`, texto: texto.substring(i, i + MAX_CHARS) });
    i += MAX_CHARS - SOLAPE;
    idx++;
  }
  return partes;
}

function construirChunks(cfg) {
  const json = JSON.parse(readFileSync(join(__dir, cfg.archivo), 'utf-8'));
  const chunks = [];
  for (const s of json.secciones) {
    const texto = (s.texto || '').trim();
    if (texto.length < 30) continue;
    const codigo = s.codigo;
    const metadataBase = {
      numero: s.numero,
      decreto: cfg.decreto,
      ley: json.ley,
      version: json.ultima_version,
    };
    const taxonomia = clasificar(cfg.fuente, codigo, metadataBase);
    for (const frag of fragmentar(texto, codigo)) {
      chunks.push({
        fuente: cfg.fuente,
        codigo: frag.codigo,
        titulo: `Art. ${s.numero} ${cfg.fuente}`,
        texto: frag.texto,
        metadata: { ...metadataBase, ...taxonomia },
      });
    }
  }
  return chunks;
}

async function embeddings(textos) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  return (await r.json()).data.map(d => d.embedding);
}

// ── main ──────────────────────────────────────────────────────────────────────

const porFuente = FUENTES.map(cfg => ({ cfg, chunks: construirChunks(cfg) }));

console.log('Chunks a indexar desde la extraccion corregida:');
let total = 0;
for (const { cfg, chunks } of porFuente) {
  const bis = chunks.filter(c => /\b(bis|ter|qu[aá]ter)\b/.test(c.metadata.numero)).length;
  const verif = chunks.filter(c => c.metadata.clasificacion_metodo === 'verificado').length;
  console.log(`  ${cfg.fuente.padEnd(5)} ${String(chunks.length).padStart(4)} chunks ` +
              `| ${bis} de articulos bis/ter | taxonomia verificada en ${verif}`);
  total += chunks.length;
}
console.log(`  TOTAL ${total}`);

// control de sanidad: la marginalia no debe sobrevivir a la extraccion nueva
const RUIDO = /Decreto\s+\d+,\s*VIVIENDA\b|Art\.\s*(?:UNICO|ÚNICO)\s*N/;
const sucios = porFuente.flatMap(({ chunks }) => chunks.filter(c => RUIDO.test(c.texto)));
console.log(`\nchunks con marginalia de decreto: ${sucios.length}` +
            (sucios.length ? '  <-- REVISAR' : '  (limpio)'));

if (DRY) { console.log('\n--dry-run: no se toco la base.'); process.exit(0); }
if (!OK) {
  console.error('\nEsto BORRA las filas OGUC y LGUC de normativa_chunks y las reinserta.');
  console.error('Respalda primero (_respaldar_chunks.mjs OGUC LGUC) y volve con --confirmo.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan credenciales de Supabase.'); process.exit(1); }
if (!OPENAI_KEY) { console.error('Falta OPENAI_API_KEY.'); process.exit(1); }

const H = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

for (const { cfg, chunks } of porFuente) {
  console.log(`\n=== ${cfg.fuente} ===`);

  // 1. embeddings PRIMERO: si OpenAI falla, la base queda intacta.
  const conEmb = [];
  for (let i = 0; i < chunks.length; i += LOTE) {
    const lote = chunks.slice(i, i + LOTE);
    const vecs = await embeddings(lote.map(c => c.texto));
    lote.forEach((c, j) => conEmb.push({ ...c, embedding: vecs[j] }));
    process.stdout.write(`  embeddings ${conEmb.length}/${chunks.length}\r`);
  }
  console.log(`  embeddings ${conEmb.length}/${chunks.length}  listo`);

  // 2. borrar las filas viejas de esta fuente
  const del = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?fuente=eq.${cfg.fuente}`, {
    method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' },
  });
  if (!del.ok) { console.error('  ERROR al borrar:', del.status, await del.text()); process.exit(1); }
  console.log('  filas viejas borradas');

  // 3. insertar
  let ins = 0;
  for (let i = 0; i < conEmb.length; i += LOTE) {
    const lote = conEmb.slice(i, i + LOTE);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(lote),
    });
    if (!r.ok) { console.error('\n  ERROR al insertar:', r.status, await r.text()); process.exit(1); }
    ins += lote.length;
    process.stdout.write(`  insertados ${ins}/${conEmb.length}\r`);
  }
  console.log(`  insertados ${ins}/${conEmb.length}  listo`);
}

console.log('\nRe-indexado terminado. Verifica con _estado_db.mjs.');

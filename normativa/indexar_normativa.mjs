/**
 * indexar_normativa.mjs
 * Indexa normativa en Supabase pgvector.
 *
 * ⚠️ ESTE SCRIPT NO ES LA VÍA DE INDEXACIÓN VIGENTE — NO CORRERLO A CIEGAS.
 * (Guard agregado 2026-09-21, auditoría Fase 1 ACH-DATA-001. Ver
 * Proyecto/Auditoria_Fase1_Detalle_Normativa.md §1 para el análisis completo.)
 *
 * Las fuentes que este archivo referencia quedaron DESACTUALIZADAS respecto de
 * lo que realmente pobló la base de producción (1.608 filas). Correrlo tal cual
 * degradaría la base de 3 formas distintas:
 *
 *   1. OGUC/LGUC — apunta a nacional/Fuentes/oguc.json (644 arts.) y
 *      Fuentes/lguc.json (234 arts.), pero producción se pobló desde
 *      nacional/oguc_pdf.json (770 secciones) y nacional/lguc_pdf.json (245),
 *      vía _idx_oguc.mjs / _idx_lguc.mjs. El upsert es on_conflict=codigo con
 *      merge-duplicates: sobrescribiría texto+embedding de las filas que
 *      coincidan con la versión vieja de menor cobertura, y dejaría huérfanas
 *      (nunca borradas) las que no tengan correspondencia.
 *      OJO: los 2 esquemas son distintos ({articulos:[...]} vs {secciones:[...]}),
 *      así que NO alcanza con cambiar la ruta — chunksLey() no leería nada.
 *   2. DDU Libro Completo — indexaría las ~1.144 secciones CRUDAS de
 *      nacional/ddu_libro.json (chunking automático por página, con duplicados),
 *      revirtiendo la curación deliberada de _limpiar_ddu.mjs, que deja la tabla
 *      acotada a 10 circulares verificadas. Producción usa las 113 secciones
 *      curadas de nacional/ddu_libro_seleccion.json vía _idx_libro_seleccion.mjs.
 *      Como esos códigos NO colisionan, entrarían como filas NUEVAS: inflaría la
 *      tabla con contenido no verificado en vez de sobrescribir.
 *   3. PRC — apunta a normativa/comunas/, carpeta que no existe (las comunas
 *      viven en normativa/{nunoa,santiago,providencia}/). Ese bloque nunca
 *      corrió. El único PRC real en producción (PRC-PRV, Providencia) lo indexó
 *      _idx_prc.mjs, con lógica ad-hoc completamente distinta a chunksPRC().
 *
 * La vía real hoy es el conjunto de scripts _idx_*.mjs (uno por fuente, cada uno
 * borra y reindexa solo lo suyo), + _limpiar_ddu.mjs, + backfill_metadata.mjs
 * para la taxonomía. Este archivo se conserva como referencia del pipeline
 * "completo" que se pensó originalmente, no como herramienta ejecutable.
 *
 * Si aun así querés correrlo (sabiendo todo lo anterior), hay que pasar el flag
 * explícito:
 *   node indexar_normativa.mjs --confirmo-reindexado-completo
 *
 * Uso (variables de entorno, en cualquier caso):
 *   $env:OPENAI_API_KEY   = "sk-proj-..."
 *   $env:SUPABASE_URL     = "https://xxxx.supabase.co"
 *   $env:SUPABASE_KEY     = "eyJ..."   ← service_role key
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { clasificar } from './clasificar_normativa.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Configuración ──────────────────────────────────────────────────────────────

const OPENAI_API_KEY  = process.env.OPENAI_API_KEY  || '';
const SUPABASE_URL    = process.env.SUPABASE_URL    || '';
const SUPABASE_KEY    = process.env.SUPABASE_KEY    || '';   // service_role

const EMBEDDING_MODEL  = 'text-embedding-3-small';
const BATCH_EMBED      = 100;   // textos por llamada a OpenAI
const BATCH_UPSERT     = 50;    // filas por upsert a Supabase
const MAX_CHARS        = 6500;  // ~8k tokens; fragmentar (no cortar) si el artículo es más largo
// NOTA: extraer_ddu.mjs tiene su propio MAX_CHARS/SOLAPAMIENTO (3000/300), más
// chico a propósito para su fallback sin estructurar — no es la misma
// constante duplicada por descuido, ver comentario en dividirEnChunks().

// ── Utilidades ─────────────────────────────────────────────────────────────────

function leerJSON(ruta) {
  if (!existsSync(ruta)) return null;
  return JSON.parse(readFileSync(ruta, 'utf-8'));
}

/** Elimina chunks con codigo duplicado, renombrando los repetidos con sufijo -dup2, -dup3... */
function deduplicar(chunks) {
  const seen = new Map();
  return chunks.map(c => {
    if (!seen.has(c.codigo)) {
      seen.set(c.codigo, 1);
      return c;
    }
    const n = seen.get(c.codigo) + 1;
    seen.set(c.codigo, n);
    return { ...c, codigo: `${c.codigo}-dup${n}` };
  });
}

/** Divide texto largo en fragmentos con solapamiento */
function fragmentar(texto, codigo, maxChars = MAX_CHARS) {
  if (texto.length <= maxChars) return [{ codigo, texto }];
  const SOLAP = 400;
  const partes = [];
  let i = 0, idx = 1;
  while (i < texto.length) {
    partes.push({ codigo: `${codigo}-pt${idx}`, texto: texto.substring(i, i + maxChars) });
    i += maxChars - SOLAP;
    idx++;
  }
  return partes;
}

// ── Construir chunks desde cada fuente ────────────────────────────────────────

// NOTA 2026-09-21 (Backlog_Macro.md item 8, taxonomia multidimensional): las
// 3 funciones de abajo ahora llaman a clasificar() (clasificar_normativa.mjs)
// para poblar metadata con la taxonomia real desde el momento de la carga --
// antes solo guardaban bookkeeping minimo (ley/version, ddu/titulo_doc,
// comuna/archivo). Fuente unica compartida con backfill_metadata.mjs, para
// no repetir el problema real de reglas_verificacion.json vs. schema.sql
// (misma info, 2 copias, desincronizadas) encontrado hoy mismo.

function chunksLey(json, fuente, prefijo) {
  const chunks = [];
  for (const art of json.articulos) {
    const codigo = `${prefijo}-${art.numero}`;
    const texto = art.texto?.trim();
    if (!texto || texto.length < 10) continue;
    const metadataBase = { ley: json.ley || json.nombre, version: json.ultima_version };
    const taxonomia = clasificar(fuente, codigo, metadataBase);
    for (const frag of fragmentar(texto, codigo)) {
      chunks.push({
        fuente,
        codigo:  frag.codigo,
        titulo:  `Art. ${art.numero}`,
        texto:   frag.texto,
        metadata: { ...metadataBase, ...taxonomia },
      });
    }
  }
  return chunks;
}

function chunksDDU(json) {
  if (!json?.secciones) return [];
  const chunks = [];
  for (const s of json.secciones) {
    const texto = (s.texto || '').trim();
    if (texto.length <= 20) continue;
    // Antes truncaba con .substring(0, MAX_CHARS) — perdía el resto de secciones
    // largas en silencio. Usa fragmentar() como chunksLey/chunksPRC, misma
    // constante MAX_CHARS/SOLAP para las 4 fuentes en vez de una regla aparte.
    const metadataBase = { ddu: json.numero, titulo_doc: json.titulo };
    const taxonomia = clasificar('DDU', s.codigo, metadataBase);
    for (const frag of fragmentar(texto, s.codigo)) {
      chunks.push({
        fuente:   'DDU',
        codigo:   frag.codigo,
        titulo:   s.titulo || '',
        texto:    frag.texto,
        metadata: { ...metadataBase, ...taxonomia },
      });
    }
  }
  return chunks;
}

function chunksPRC(comunaDir) {
  const chunks = [];
  const archivos = readdirSync(comunaDir).filter(f => f.endsWith('.json'));
  for (const archivo of archivos) {
    const json = leerJSON(join(comunaDir, archivo));
    if (!json) continue;
    const comuna = json.comuna || archivo.replace('.json', '');
    const prefijo = `PRC-${comuna.toUpperCase().replace(/\s+/g, '-')}`;
    for (const art of (json.articulos || json.normas || [])) {
      const codigo = `${prefijo}-${art.numero || art.id}`;
      const texto = (art.texto || art.contenido || '').trim();
      if (!texto) continue;
      const metadataBase = { comuna, archivo };
      const taxonomia = clasificar(prefijo, codigo, metadataBase);
      for (const frag of fragmentar(texto, codigo)) {
        chunks.push({
          fuente:   prefijo,
          codigo:   frag.codigo,
          titulo:   art.titulo || `Art. ${art.numero}`,
          texto:    frag.texto,
          metadata: { ...metadataBase, ...taxonomia },
        });
      }
    }
  }
  return chunks;
}

// ── OpenAI embeddings ──────────────────────────────────────────────────────────

async function generarEmbeddings(textos) {
  const resp = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: textos }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${err.substring(0, 300)}`);
  }

  const json = await resp.json();
  return json.data.map(d => d.embedding);
}

// ── Supabase upsert ────────────────────────────────────────────────────────────

async function upsertChunks(filas) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?on_conflict=codigo`, {
    method: 'POST',
    headers: {
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Content-Type':   'application/json',
      'Prefer':         'resolution=merge-duplicates',
    },
    body: JSON.stringify(filas),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Supabase error ${resp.status}: ${err.substring(0, 300)}`);
  }
}

// ── Pipeline principal ─────────────────────────────────────────────────────────

async function procesarChunks(chunks, label) {
  console.log(`\n── ${label}: ${chunks.length} chunks`);
  let indexados = 0;
  let errores = 0;

  for (let i = 0; i < chunks.length; i += BATCH_EMBED) {
    const lote = chunks.slice(i, i + BATCH_EMBED);
    const textos = lote.map(c => `${c.titulo}\n${c.texto}`.substring(0, 8000));

    // Embeddings
    let embeddings;
    try {
      embeddings = await generarEmbeddings(textos);
    } catch (e) {
      console.error(`  Error embeddings lote ${i}–${i + lote.length}: ${e.message}`);
      errores += lote.length;
      continue;
    }

    // Adjuntar embeddings a los chunks
    const filasConEmbedding = lote.map((c, j) => ({ ...c, embedding: embeddings[j] }));

    // Upsert en sub-lotes a Supabase
    for (let j = 0; j < filasConEmbedding.length; j += BATCH_UPSERT) {
      const subLote = filasConEmbedding.slice(j, j + BATCH_UPSERT);
      try {
        await upsertChunks(subLote);
        indexados += subLote.length;
      } catch (e) {
        console.error(`  Error upsert ${j}: ${e.message}`);
        errores += subLote.length;
      }
    }

    process.stdout.write(`  ${Math.min(i + BATCH_EMBED, chunks.length)}/${chunks.length} procesados...\r`);
  }

  console.log(`  OK: ${indexados} indexados, ${errores} errores.`);
}

async function main() {
  // Guard de ejecución accidental (2026-09-21, auditoría Fase 1 ACH-DATA-001).
  // Ver el encabezado de este archivo para el detalle de las 3 formas en que
  // correrlo tal cual degradaría la base de producción.
  if (!process.argv.includes('--confirmo-reindexado-completo')) {
    console.error(`
================================================================================
  ABORTADO -- este script NO es la via de indexacion vigente.
================================================================================

  Las fuentes que referencia quedaron desactualizadas respecto de lo que
  realmente poblo la base (1.608 filas). Correrlo degradaria produccion:

    1. OGUC/LGUC : sobrescribiria con las versiones viejas de MENOR cobertura
                   (644 vs 770 arts. / 234 vs 245), dejando filas huerfanas.
                   Ademas el esquema de las fuentes nuevas es distinto, asi
                   que cambiar solo la ruta tampoco alcanza.
    2. DDU libro : reinsertaria ~1.144 secciones CRUDAS como filas NUEVAS,
                   revirtiendo la curacion de _limpiar_ddu.mjs (10 circulares
                   verificadas) e inflando la tabla con contenido sin curar.
    3. PRC       : apunta a normativa/comunas/, que no existe. Nunca corrio.

  La via real hoy son los scripts _idx_*.mjs (uno por fuente), mas
  _limpiar_ddu.mjs y backfill_metadata.mjs. Ver el encabezado de este archivo
  y Proyecto/Auditoria_Fase1_Detalle_Normativa.md para el analisis completo.

  Si entendiste todo lo anterior y aun asi querés ejecutarlo:
    node indexar_normativa.mjs --confirmo-reindexado-completo

================================================================================
`);
    process.exit(1);
  }
  console.warn('AVISO: corriendo con --confirmo-reindexado-completo. Leiste el encabezado, asumo que sabes lo que hacés.\n');

  // Validar configuración
  if (!OPENAI_API_KEY)  { console.error('Falta OPENAI_API_KEY');  process.exit(1); }
  if (!SUPABASE_URL)    { console.error('Falta SUPABASE_URL');     process.exit(1); }
  if (!SUPABASE_KEY)    { console.error('Falta SUPABASE_KEY');     process.exit(1); }

  console.log('ArchiCheck — Indexación de normativa en Supabase pgvector');
  console.log(`Modelo: ${EMBEDDING_MODEL} · Destino: ${SUPABASE_URL}`);

  // ── OGUC ──────────────────────────────────────────────────────────────────────
  const oguc = leerJSON(join(__dir, 'nacional/Fuentes/oguc.json'));
  if (oguc) {
    const chunks = deduplicar(chunksLey(oguc, 'OGUC', 'OGUC'));
    await procesarChunks(chunks, `OGUC (${oguc.total_articulos} arts.)`);
  } else {
    console.warn('SKIP: nacional/Fuentes/oguc.json no encontrado');
  }

  // ── LGUC ──────────────────────────────────────────────────────────────────────
  const lguc = leerJSON(join(__dir, 'nacional/Fuentes/lguc.json'));
  if (lguc) {
    const chunks = deduplicar(chunksLey(lguc, 'LGUC', 'LGUC'));
    await procesarChunks(chunks, `LGUC (${lguc.total_articulos} arts.)`);
  } else {
    console.warn('SKIP: nacional/Fuentes/lguc.json no encontrado');
  }

  // ── Ley 19.300 ────────────────────────────────────────────────────────────────
  const ley19300 = leerJSON(join(__dir, 'nacional/Fuentes/ley19300.json'));
  if (ley19300) {
    const chunks = deduplicar(chunksLey(ley19300, 'LEY19300', 'LEY19300'));
    await procesarChunks(chunks, `Ley 19.300 (${ley19300.total_articulos} arts.)`);
  } else {
    console.warn('SKIP: nacional/Fuentes/ley19300.json no encontrado');
  }

  // ── DDU 351 ───────────────────────────────────────────────────────────────────
  const ddu351 = leerJSON(join(__dir, 'nacional/ddu_351.json'));
  if (ddu351) {
    await procesarChunks(deduplicar(chunksDDU(ddu351)), 'DDU 351 (Accesibilidad)');
  } else {
    console.warn('SKIP: nacional/ddu_351.json — ejecuta extraer_ddu.mjs primero');
  }

  // ── DDU 447 ───────────────────────────────────────────────────────────────────
  const ddu447 = leerJSON(join(__dir, 'nacional/ddu_447.json'));
  if (ddu447) {
    await procesarChunks(deduplicar(chunksDDU(ddu447)), 'DDU 447 (Aportes y Tramitación)');
  } else {
    console.warn('SKIP: nacional/ddu_447.json — ejecuta extraer_ddu.mjs primero');
  }

  // ── DDU Libro Completo ────────────────────────────────────────────────────────
  const dduLibro = leerJSON(join(__dir, 'nacional/ddu_libro.json'));
  if (dduLibro) {
    await procesarChunks(deduplicar(chunksDDU(dduLibro)), 'DDU Libro Completo');
  } else {
    console.warn('SKIP: nacional/ddu_libro.json — ejecuta extraer_ddu.mjs primero');
  }

  // ── PRCs ──────────────────────────────────────────────────────────────────────
  const comunasDir = join(__dir, 'comunas');
  if (existsSync(comunasDir)) {
    const subcarpetas = readdirSync(comunasDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const comuna of subcarpetas) {
      const prcChunks = deduplicar(chunksPRC(join(comunasDir, comuna)));
      if (prcChunks.length > 0) {
        await procesarChunks(prcChunks, `PRC ${comuna}`);
      }
    }
  } else {
    // Este `else` faltaba (agregado 2026-09-21, ACH-DATA-002): era el UNICO de
    // los 7 bloques sin aviso, asi que el salteo de PRC era 100% silencioso --
    // la corrida terminaba diciendo "Indexación completa" sin que nada indicara
    // que ninguna comuna se habia indexado.
    console.warn('SKIP: normativa/comunas/ no existe — ningún PRC indexado.');
    console.warn('      Las comunas reales viven en normativa/{nunoa,santiago,providencia}/');
    console.warn('      y el único PRC en producción (PRC-PRV) lo indexa _idx_prc.mjs,');
    console.warn('      con lógica distinta a chunksPRC(). Ver encabezado de este archivo.');
  }

  console.log('\nIndexación completa.');
  console.log('Siguiente paso: crear el índice IVFFlat en Supabase SQL Editor:');
  console.log('  CREATE INDEX normativa_chunks_embedding_idx');
  console.log('    ON normativa_chunks USING ivfflat (embedding vector_cosine_ops)');
  console.log('    WITH (lists = 100);');
}

main().catch(err => {
  console.error('\nError fatal:', err.message);
  process.exit(1);
});

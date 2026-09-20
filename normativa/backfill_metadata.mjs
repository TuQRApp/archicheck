/**
 * backfill_metadata.mjs
 * Actualiza metadata (taxonomia multidimensional) de las filas YA cargadas
 * en normativa_chunks, sin tocar texto/titulo/embedding -- para cuando la
 * taxonomia de clasificar_normativa.mjs/taxonomia_articulos.json cambia
 * DESPUES de la carga inicial y hay que propagarla sin re-generar
 * embeddings (evita depender de OPENAI_API_KEY para esto).
 *
 * Corrida real 2026-09-21: 1608/1608 filas actualizadas, 0 errores (ver
 * Fase 2/Convenciones_BIM.md seccion E / memoria de indexacion normativa
 * para el detalle -- incluyo el hallazgo real de que la fuente PRC en la
 * tabla es 'PRC-PRV', no 'PRC', corregido en la 2a corrida).
 *
 * Uso:
 *   $env:SUPABASE_SECRET = "sb_secret_..."   <- secret key (no publishable)
 *   node backfill_metadata.mjs
 */

import { clasificar } from './clasificar_normativa.mjs';

const SUPA_URL = process.env.SUPABASE_URL || 'https://xkpvnlvzhdgdisedlelz.supabase.co';
const SUPA_KEY = process.env.SUPABASE_SECRET;
if (!SUPA_KEY) { console.error('Falta SUPABASE_SECRET (secret key, no publishable -- ver panel API Keys del proyecto)'); process.exit(1); }

async function fetchTodas() {
  const filas = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const resp = await fetch(`${SUPA_URL}/rest/v1/normativa_chunks?select=codigo,fuente,metadata&order=codigo&offset=${offset}&limit=${PAGE}`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
    if (!resp.ok) throw new Error(`fetch error ${resp.status}: ${await resp.text()}`);
    const lote = await resp.json();
    filas.push(...lote);
    if (lote.length < PAGE) break;
    offset += PAGE;
  }
  return filas;
}

async function actualizarFila(codigo, metadataNueva) {
  const resp = await fetch(`${SUPA_URL}/rest/v1/normativa_chunks?codigo=eq.${encodeURIComponent(codigo)}&select=codigo`, {
    method: 'PATCH',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify({ metadata: metadataNueva }),
  });
  if (!resp.ok) throw new Error(`update ${codigo}: ${resp.status} ${await resp.text()}`);
}

async function main() {
  console.log('Descargando filas actuales...');
  const filas = await fetchTodas();
  console.log(`Total filas: ${filas.length}`);

  const porFuente = {};
  for (const f of filas) porFuente[f.fuente] = (porFuente[f.fuente] || 0) + 1;
  console.log('Por fuente:', porFuente);

  const CONCURRENCIA = 15;
  let hechas = 0, errores = 0;
  for (let i = 0; i < filas.length; i += CONCURRENCIA) {
    const lote = filas.slice(i, i + CONCURRENCIA);
    await Promise.all(lote.map(async (fila) => {
      // clasificar() adentro del try (fix Revision Ing SW Paso 2,
      // DeepSeek+Codex 2026-09-21, hallazgo real coincidente de ambos):
      // antes vivia afuera -- si lanzaba (fuente/codigo con forma
      // inesperada), rechazaba la promesa del lote, Promise.all abortaba
      // completo, y el catch de arriba (main().catch) no dice que fila
      // fallo, solo el mensaje generico -- una corrida de 1608 filas podia
      // quedar a medio terminar sin poder identificar cual quedo afuera.
      try {
        const tax = clasificar(fila.fuente, fila.codigo, fila.metadata);
        const metadataNueva = { ...fila.metadata, ...tax };
        await actualizarFila(fila.codigo, metadataNueva);
        hechas++;
      } catch (e) {
        errores++;
        console.error(`${fila.codigo}: ${e.message}`);
      }
    }));
    process.stdout.write(`  ${Math.min(i + CONCURRENCIA, filas.length)}/${filas.length}\r`);
  }
  console.log(`\nListo. Actualizadas: ${hechas}, errores: ${errores}`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });

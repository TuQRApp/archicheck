/**
 * _extraer_ddu351.mjs
 * Extrae y estructura el DDU 351 (Accesibilidad Universal) con Claude Sonnet.
 * Procesa en bloques de 7 páginas para no exceder el output máximo de Claude.
 *
 * Uso: node _extraer_ddu351.mjs
 * Desde: archicheck/normativa/
 */

import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir   = dirname(fileURLToPath(import.meta.url));
const PDF     = join(__dir, 'nacional/Fuentes/DDU 351_Accesibilidad.pdf');
const SALIDA  = join(__dir, 'nacional/ddu_351.json');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const PAGINAS_POR_BLOQUE = 7;

// ── pdfjs ──────────────────────────────────────────────────────────────────────

async function cargarPdfjs() {
  const pdfjsPath  = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const mod  = await import(pathToFileURL(pdfjsPath).href);
  const pdfjs = mod.default ?? mod;
  const GO    = pdfjs.GlobalWorkerOptions ?? mod.GlobalWorkerOptions;
  GO.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

async function extraerPaginas(pdfjs, rutaPdf) {
  const buf = readFileSync(rutaPdf);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    const texto   = content.items.map(it => it.str || '').join(' ').replace(/\s{3,}/g, '  ').trim();
    paginas.push({ pagina: i, texto });
  }
  console.log(`  ${doc.numPages} páginas extraídas.`);
  return paginas;
}

// ── Claude ────────────────────────────────────────────────────────────────────

async function estructurarBloque(texto, bloque, totalBloques, seccionInicial) {
  const prompt = `Eres un experto en normativa urbana chilena (DDU 351 — Accesibilidad Universal, Circular ORD. N° 0167 MINVU).

Analiza el siguiente fragmento del documento (bloque ${bloque}/${totalBloques}) y extrae cada sección identificable como un objeto JSON.

Reglas:
- Asigna codigo secuencial: "DDU-351-s${seccionInicial}", "DDU-351-s${seccionInicial + 1}", etc.
- titulo: nombre o encabezado de la sección (si no hay encabezado claro, describe el tema)
- texto: contenido completo de esa sección, máximo 3000 caracteres. Si es más largo, corta en subsecciones.
- Si el fragmento es la continuación de una sección anterior, empieza con codigo "DDU-351-s${seccionInicial}" igualmente.

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones):
[{"codigo":"DDU-351-s${seccionInicial}","titulo":"...","texto":"..."}]

TEXTO DEL FRAGMENTO:
${texto}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Claude ${resp.status}: ${await resp.text()}`);

  const raw = (await resp.json()).content[0].text.trim();

  // Extraer JSON: manejar code fences y JSON parcial
  const sinFences = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const match = sinFences.match(/\[[\s\S]*/);
  if (!match) throw new Error(`Sin JSON en respuesta: ${raw.substring(0, 300)}`);

  let jsonStr = match[0];
  // Si está incompleto (sin cierre ]), intentar cerrar el último objeto
  if (!jsonStr.trim().endsWith(']')) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) jsonStr = jsonStr.substring(0, lastBrace + 1) + ']';
    else throw new Error('JSON incompleto y no recuperable');
  }

  return JSON.parse(jsonStr);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  if (!ANTHROPIC_KEY) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1); }

  console.log('DDU 351 — Extracción con Claude Sonnet');
  const pdfjs   = await cargarPdfjs();
  const paginas = await extraerPaginas(pdfjs, PDF);

  const bloques = [];
  for (let i = 0; i < paginas.length; i += PAGINAS_POR_BLOQUE) {
    bloques.push(paginas.slice(i, i + PAGINAS_POR_BLOQUE));
  }

  const todasSecciones = [];
  let seccionActual = 1;

  for (let b = 0; b < bloques.length; b++) {
    const texto = bloques[b].map(p => `[Página ${p.pagina}]\n${p.texto}`).join('\n\n');
    const pIni  = bloques[b][0].pagina;
    const pFin  = bloques[b][bloques[b].length - 1].pagina;
    console.log(`  Bloque ${b + 1}/${bloques.length} (págs. ${pIni}–${pFin}, ${Math.round(texto.length / 1000)} KB)...`);

    try {
      const secciones = await estructurarBloque(texto, b + 1, bloques.length, seccionActual);
      console.log(`    → ${secciones.length} secciones`);
      todasSecciones.push(...secciones);
      seccionActual += secciones.length;
    } catch (e) {
      console.error(`    Error bloque ${b + 1}: ${e.message}`);
      // Fallback: guardar como chunk crudo
      todasSecciones.push({
        codigo: `DDU-351-s${seccionActual}`,
        titulo: `DDU 351 — páginas ${pIni}–${pFin}`,
        texto:  texto.substring(0, 3000),
      });
      seccionActual++;
    }
  }

  const output = {
    fuente:   'DDU',
    numero:   '351',
    titulo:   'DDU 351 — Circular ORD. N° 0167 — Accesibilidad Universal (D.S. 50/2015)',
    paginas:  paginas.length,
    generado: new Date().toISOString().split('T')[0],
    secciones: todasSecciones,
  };

  writeFileSync(SALIDA, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nGuardado: ${SALIDA}`);
  console.log(`Total secciones: ${todasSecciones.length}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

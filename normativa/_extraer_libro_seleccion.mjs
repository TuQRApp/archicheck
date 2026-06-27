/**
 * _extraer_libro_seleccion.mjs
 * Extrae y estructura con Claude las circulares DDU más relevantes para
 * permisos de edificación DOM, usando el texto ya extraído de ddu_libro.json.
 *
 * Uso: node _extraer_libro_seleccion.mjs
 * Desde: archicheck/normativa/
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const LIBRO_JSON = join(__dir, 'nacional/ddu_libro.json');
const SALIDA = join(__dir, 'nacional/ddu_libro_seleccion.json');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';

// Circulares relevantes para DOM: [numero, descripcion]
const CIRCULARES_OBJETIVO = [
  ['172',  'Plazos Direcciones de Obras Municipales (Art. 24 Ley 19.880)'],
  ['176',  'Aplicación art. 1.4.7 OGUC — certificados e informes previos'],
  ['186',  'Aplicación arts. 2.1.18 y 2.1.43 OGUC — urbanismo y construcción'],
  ['200',  'Subdivisión predial — Ley N° 20.234'],
  ['201',  'Permisos de edificación simplificados — Ley N° 20.251'],
  ['157',  'Registro Nacional de Revisores Independientes de Obras (Ley 20.071)'],
  ['1022', 'Aplicación arts. 1.1.2, 5.1.14 y 5.1.17 OGUC — tipos de construcción'],
  ['912',  'Aplicación art. 5.1.2 N°2 OGUC — tipo y calidad de edificación'],
];

const CHARS_POR_BLOQUE = 8000;

// Agrupa secciones del libro por número de circular detectado
function agruparPorCircular(libro) {
  const grupos = new Map();
  for (const s of libro.secciones) {
    // codigo como "DDU-172-p3" → extraer "172"
    const m = s.codigo.match(/^DDU-0*(\d+)-p/);
    if (!m) continue;
    const num = m[1];
    if (!grupos.has(num)) grupos.set(num, []);
    grupos.get(num).push(s.texto || '');
  }
  return grupos;
}

async function estructurarBloque(texto, bloque, totalBloques, seccionInicial, numCircular, descCircular) {
  const prompt = `Eres un experto en normativa urbana chilena. Analiza este fragmento de la DDU ${numCircular} — ${descCircular}.

Bloque ${bloque} de ${totalBloques}. Extrae cada sección identificable como objeto JSON.

Reglas:
- codigo: "DDU-${numCircular}-s${seccionInicial}", "DDU-${numCircular}-s${seccionInicial + 1}", etc.
- titulo: encabezado o tema de la sección (texto descriptivo claro)
- texto: contenido completo, máximo 2800 caracteres. Si es necesario, divide en DDU-${numCircular}-s${seccionInicial}a, s${seccionInicial}b, etc.
- Omite páginas de portada, índice, o texto ilegible (menos de 50 caracteres útiles)

Responde ÚNICAMENTE con JSON válido, sin markdown ni explicaciones:
[{"codigo":"DDU-${numCircular}-s${seccionInicial}","titulo":"...","texto":"..."}]

TEXTO:
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

  const sinFences = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const match = sinFences.match(/\[[\s\S]*/);
  if (!match) throw new Error(`Sin JSON: ${raw.substring(0, 200)}`);

  let jsonStr = match[0];
  if (!jsonStr.trim().endsWith(']')) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) jsonStr = jsonStr.substring(0, lastBrace + 1) + ']';
    else throw new Error('JSON incompleto sin recovery posible');
  }

  return JSON.parse(jsonStr);
}

async function procesarCircular(numCircular, descCircular, paginas) {
  const textoTotal = paginas.join('\n\n');
  console.log(`\nDDU-${numCircular} — ${descCircular}`);
  console.log(`  ${paginas.length} páginas, ${Math.round(textoTotal.length / 1000)} KB`);

  // Dividir en bloques
  const bloques = [];
  for (let i = 0; i < textoTotal.length; i += CHARS_POR_BLOQUE) {
    bloques.push(textoTotal.substring(i, i + CHARS_POR_BLOQUE));
  }

  const todasSecciones = [];
  let seccionActual = 1;

  for (let b = 0; b < bloques.length; b++) {
    process.stdout.write(`  Bloque ${b + 1}/${bloques.length}... `);
    try {
      const secciones = await estructurarBloque(
        bloques[b], b + 1, bloques.length, seccionActual, numCircular, descCircular
      );
      const validas = secciones.filter(s => s.texto && s.texto.trim().length > 30);
      console.log(`${validas.length} secciones`);
      todasSecciones.push(...validas);
      seccionActual += validas.length;
    } catch (e) {
      console.log(`ERROR: ${e.message.substring(0, 80)}`);
      todasSecciones.push({
        codigo: `DDU-${numCircular}-s${seccionActual}`,
        titulo: `DDU ${numCircular} — fragmento ${b + 1}`,
        texto: bloques[b].substring(0, 2800),
      });
      seccionActual++;
    }
  }

  return todasSecciones;
}

async function main() {
  if (!ANTHROPIC_KEY) { console.error('Falta ANTHROPIC_API_KEY'); process.exit(1); }

  console.log('Cargando ddu_libro.json...');
  const libro = JSON.parse(readFileSync(LIBRO_JSON, 'utf-8'));
  const grupos = agruparPorCircular(libro);

  console.log(`\nCirculares disponibles en el Libro: ${grupos.size}`);
  console.log('Procesando selección de 8 circulares relevantes para DOM...\n');

  const seccionesTodas = [];

  for (const [num, desc] of CIRCULARES_OBJETIVO) {
    const paginas = grupos.get(num);
    if (!paginas || paginas.length === 0) {
      console.log(`DDU-${num}: NO encontrada en el Libro (saltando)`);
      continue;
    }
    const secciones = await procesarCircular(num, desc, paginas);
    seccionesTodas.push(...secciones);
    console.log(`  → Total DDU-${num}: ${secciones.length} secciones`);
  }

  const output = {
    fuente: 'DDU',
    numero: 'LIBRO-SELECCION',
    titulo: 'DDU Libro — Circulares seleccionadas para permiso de edificación DOM',
    circulares: CIRCULARES_OBJETIVO.map(([n, d]) => ({ numero: n, descripcion: d })),
    generado: new Date().toISOString().split('T')[0],
    secciones: seccionesTodas,
  };

  writeFileSync(SALIDA, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nGuardado: nacional/ddu_libro_seleccion.json (${seccionesTodas.length} secciones)`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

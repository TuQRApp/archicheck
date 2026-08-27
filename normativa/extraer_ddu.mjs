/**
 * extraer_ddu.mjs
 * Extrae texto de los 3 PDFs DDU y los convierte a JSON estructurado.
 *
 * Uso: node extraer_ddu.mjs
 * Desde: archicheck/normativa/
 *
 * Salida: nacional/ddu_351.json, nacional/ddu_447.json, nacional/ddu_libro.json
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Configuración ──────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-REEMPLAZAR';

const PDFS = [
  {
    archivo: 'nacional/Fuentes/DDU 351_Accesibilidad.pdf',
    salida:  'nacional/ddu_351.json',
    fuente:  'DDU',
    numero:  '351',
    titulo:  'DDU 351 — Accesibilidad Universal',
    modo:    'claude',    // Claude estructura el texto
  },
  {
    archivo: 'nacional/Fuentes/DDU-447-Circular-Aportes-Tramitacion-permisos-12.11.20.pdf',
    salida:  'nacional/ddu_447.json',
    fuente:  'DDU',
    numero:  '447',
    titulo:  'DDU 447 — Aportes y Tramitación de Permisos',
    modo:    'claude',
  },
  {
    archivo: 'nacional/Fuentes/DDU_LIBRO_COMPLETO.pdf',
    salida:  'nacional/ddu_libro.json',
    fuente:  'DDU',
    numero:  'LIBRO',
    titulo:  'DDU Libro Completo — Compilación de Circulares',
    modo:    'chunks',   // demasiado grande para Claude, se divide por páginas
  },
];

// ── Imports dinámicos ──────────────────────────────────────────────────────────

const pdfjsPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');

async function cargarPdfjs() {
  const mod = await import(pathToFileURL(pdfjsPath).href);
  const pdfjs = mod.default ?? mod;
  // Worker para Node.js — apuntar al archivo legacy
  const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

// ── Extraer texto del PDF ──────────────────────────────────────────────────────

async function extraerTexto(pdfjs, rutaPdf) {
  const buf = readFileSync(rutaPdf);
  const data = new Uint8Array(buf);
  const doc = await pdfjs.getDocument({ data }).promise;
  const paginas = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const texto = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s{3,}/g, '  ')
      .trim();
    paginas.push({ pagina: i, texto });
    if (i % 10 === 0) process.stdout.write(`  Página ${i}/${doc.numPages}...\r`);
  }
  console.log(`  ${doc.numPages} páginas extraídas.`);
  return paginas;
}

// ── Estructurar con Claude ─────────────────────────────────────────────────────

async function estructurarConClaude(textoCompleto, meta) {
  const prompt = `Eres un experto en normativa urbana chilena. Se te entrega el texto completo del ${meta.titulo}.

Tu tarea: extraer y estructurar cada SECCIÓN o CAPÍTULO como un objeto JSON separado.

Para cada sección identifica:
- "codigo": identificador único como "DDU-${meta.numero}-s1", "DDU-${meta.numero}-s2", etc.
- "titulo": título de la sección (p. ej. "Disposiciones Generales", "Requisitos de Accesibilidad")
- "texto": texto completo de esa sección (máximo 3000 caracteres por sección; si es más largo, divide en subsecciones)

Responde ÚNICAMENTE con un array JSON válido:
[
  { "codigo": "DDU-${meta.numero}-s1", "titulo": "...", "texto": "..." },
  { "codigo": "DDU-${meta.numero}-s2", "titulo": "...", "texto": "..." }
]

Sin texto adicional. Sin markdown. Solo el JSON.

TEXTO DEL DOCUMENTO:
${textoCompleto.substring(0, 60000)}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${err}`);
  }

  const json = await resp.json();
  const rawText = json.content[0].text.trim();

  // Extraer JSON del response (puede venir con markdown code fence)
  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`Claude no devolvió JSON válido:\n${rawText.substring(0, 500)}`);

  return JSON.parse(match[0]);
}

// ── Dividir en chunks (para PDFs grandes) ─────────────────────────────────────

function dividirEnChunks(paginas, numero) {
  // Deliberadamente más chico que el MAX_CHARS/SOLAP de indexar_normativa.mjs
  // (6500/400): esto es el fallback SIN estructurar (por circular o por página),
  // se busca granularidad más fina para compensar la falta de secciones reales.
  // indexar_normativa.mjs igual vuelve a pasar estos chunks por su propio
  // fragmentar() al indexar, pero como ya vienen más chicos no los vuelve a
  // partir — no son la misma constante a propósito, no unificar sin remedir
  // la calidad de retrieval de ambos casos.
  const MAX_CHARS = 3000;
  const SOLAPAMIENTO = 300;
  const chunks = [];

  // Concatenar todo el texto
  const textoTotal = paginas.map(p => p.texto).join('\n');

  // Detectar secciones por número de circular (patrón: "Circular N° XXX" o "DDU XXX")
  // Intentar split por circulares individuales
  const patronCircular = /(?:CIRCULAR[^N]*N[°ºo]?\s*(\d+)|DDU\s+(\d+))/gi;
  const matches = [...textoTotal.matchAll(patronCircular)];

  if (matches.length > 3) {
    // Hay varias circulares identificables → dividir por ellas
    let idx = 0;
    for (let i = 0; i < matches.length; i++) {
      const inicio = matches[i].index;
      const fin = i + 1 < matches.length ? matches[i + 1].index : textoTotal.length;
      const numCircular = matches[i][1] || matches[i][2] || `${idx + 1}`;
      const segmento = textoTotal.substring(inicio, fin);

      // Si el segmento es muy largo, sub-dividir
      for (let j = 0; j < segmento.length; j += MAX_CHARS - SOLAPAMIENTO) {
        const parte = segmento.substring(j, j + MAX_CHARS);
        const sufijo = segmento.length > MAX_CHARS ? `-p${Math.floor(j / MAX_CHARS) + 1}` : '';
        chunks.push({
          codigo: `DDU-${numCircular}${sufijo}`,
          titulo: `Circular DDU ${numCircular}${sufijo ? ' (continuación)' : ''}`,
          texto: parte.trim(),
        });
      }
      idx++;
    }
  } else {
    // Sin estructura clara → dividir por páginas (grupos de 3)
    const PAGINAS_POR_CHUNK = 3;
    for (let i = 0; i < paginas.length; i += PAGINAS_POR_CHUNK) {
      const grupo = paginas.slice(i, i + PAGINAS_POR_CHUNK);
      const texto = grupo.map(p => p.texto).join('\n').substring(0, MAX_CHARS);
      const pIni = grupo[0].pagina;
      const pFin = grupo[grupo.length - 1].pagina;
      chunks.push({
        codigo: `DDU-${numero}-pg${pIni}-${pFin}`,
        titulo: `${numero} — páginas ${pIni}–${pFin}`,
        texto: texto.trim(),
      });
    }
  }

  return chunks;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Cargando pdfjs-dist...');
  const pdfjs = await cargarPdfjs();

  for (const pdf of PDFS) {
    const rutaPdf = join(__dir, pdf.archivo);
    const rutaSalida = join(__dir, pdf.salida);

    if (!existsSync(rutaPdf)) {
      console.warn(`SKIP: no existe ${pdf.archivo}`);
      continue;
    }

    console.log(`\n── ${pdf.titulo} ──`);
    console.log(`  Extrayendo texto de ${pdf.archivo}...`);
    const paginas = await extraerTexto(pdfjs, rutaPdf);

    let secciones;

    if (pdf.modo === 'claude') {
      if (!ANTHROPIC_API_KEY.startsWith('sk-ant-api')) {
        console.error('  ERROR: ANTHROPIC_API_KEY no configurada. Exporta la variable y vuelve a ejecutar.');
        continue;
      }
      const textoCompleto = paginas.map(p => p.texto).join('\n');
      console.log(`  Enviando a Claude para estructurar (${Math.round(textoCompleto.length / 1000)} KB)...`);
      try {
        secciones = await estructurarConClaude(textoCompleto, pdf);
        console.log(`  Claude generó ${secciones.length} secciones.`);
      } catch (e) {
        console.error(`  Error con Claude: ${e.message}`);
        console.log('  Fallback: usando chunking por páginas.');
        secciones = dividirEnChunks(paginas, pdf.numero);
      }
    } else {
      console.log('  Dividiendo en chunks por contenido...');
      secciones = dividirEnChunks(paginas, pdf.numero);
      console.log(`  ${secciones.length} chunks generados.`);
    }

    const output = {
      fuente:   pdf.fuente,
      numero:   pdf.numero,
      titulo:   pdf.titulo,
      paginas:  paginas.length,
      generado: new Date().toISOString().split('T')[0],
      secciones,
    };

    writeFileSync(rutaSalida, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  Guardado: ${pdf.salida} (${secciones.length} secciones)`);
  }

  console.log('\nListo. Revisa los JSON en nacional/ antes de indexar.');
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

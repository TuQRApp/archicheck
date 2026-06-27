/**
 * _extraer_oguc.mjs
 * Extrae el OGUC directamente del PDF de leychile.cl usando regex sobre el texto.
 * NO usa Claude — la estructura decimal del OGUC lo permite.
 *
 * Uso: node _extraer_oguc.mjs
 * Desde: archicheck/normativa/
 */

import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const PDF    = join(__dir, 'nacional/Fuentes/OGUC_DTO-47_05-JUN-1992.pdf');
const SALIDA = join(__dir, 'nacional/oguc_pdf.json');

const MAX_CHARS = 3000; // máximo por chunk antes de partir

// ── pdfjs ──────────────────────────────────────────────────────────────────────

async function cargarPdfjs() {
  const pdfjsPath  = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const mod   = await import(pathToFileURL(pdfjsPath).href);
  const pdfjs = mod.default ?? mod;
  const GO    = pdfjs.GlobalWorkerOptions ?? mod.GlobalWorkerOptions;
  GO.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

async function extraerTextoCompleto(pdfjs, rutaPdf) {
  const buf = readFileSync(rutaPdf);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log(`  ${doc.numPages} páginas`);

  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page    = await doc.getPage(i);
    const content = await page.getTextContent();
    paginas.push(content.items.map(it => it.str || '').join(' '));
    if (i % 50 === 0) process.stdout.write(`  ${i}/${doc.numPages}...\r`);
  }

  // Unir todo y limpiar
  let texto = paginas.join('\n');

  // Eliminar encabezados de página de leychile.cl
  texto = texto.replace(
    /Decreto 47, VIVIENDA \(1992\)\s+Biblioteca del Congreso Nacional de Chile[^\n]*página \d+ de \d+/g,
    ' '
  );
  // Colapsar espacios excesivos
  texto = texto.replace(/[ \t]{3,}/g, '  ').replace(/\n{3,}/g, '\n\n');

  return texto;
}

// ── Partir artículo largo en sub-partes ───────────────────────────────────────

function partirEnSubpartes(numero, texto) {
  if (texto.length <= MAX_CHARS) {
    return [{ numero, texto: texto.trim() }];
  }

  // Para Art 1.1.2 (definiciones): partir por cada «Término»: o "Término":
  if (numero === '1.1.2') {
    const partes = texto.split(/(?=\s*[«"][A-ZÁÉÍÓÚÑ][^»"]*[»"]:\s)/);
    const chunks = [];
    let acum = '';
    for (const p of partes) {
      if ((acum + p).length > MAX_CHARS && acum.length > 100) {
        chunks.push(acum.trim());
        acum = p;
      } else {
        acum += p;
      }
    }
    if (acum.trim()) chunks.push(acum.trim());
    return chunks
      .filter(c => c.length > 30)
      .map((c, i) => ({
        numero: i === 0 ? numero : `${numero}-${String.fromCharCode(97 + i)}`,
        texto:  c,
      }));
  }

  // Para otros artículos largos: cortar en bloques por párrafos
  const partes = [];
  let pos = 0;
  let idx = 0;
  while (pos < texto.length) {
    let fin = Math.min(pos + MAX_CHARS, texto.length);
    if (fin < texto.length) {
      const corte = texto.lastIndexOf('\n', fin);
      if (corte > pos + MAX_CHARS / 2) fin = corte;
    }
    partes.push({
      numero: idx === 0 ? numero : `${numero}-${String.fromCharCode(97 + idx)}`,
      texto:  texto.substring(pos, fin).trim(),
    });
    pos = fin;
    idx++;
  }
  return partes.filter(p => p.texto.length > 30);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('OGUC — Extracción desde PDF leychile.cl');
  const pdfjs = await cargarPdfjs();

  console.log('Extrayendo texto...');
  const texto = await extraerTextoCompleto(pdfjs, PDF);
  console.log(`\n  Texto total: ${Math.round(texto.length / 1000)} KB`);

  // Detectar artículos: "Artículo X.Y.Z."
  // El PDF puede tener "Artículo" con acento y con/sin espacio antes del número
  const RE_ART = /Artículo\s+(\d+\.\d+\.\d+)\./g;

  console.log('Detectando artículos...');
  const limites = [];
  let m;
  while ((m = RE_ART.exec(texto)) !== null) {
    limites.push({ numero: m[1], pos: m.index });
  }
  console.log(`  ${limites.length} artículos encontrados`);

  // Extraer texto de cada artículo (desde su posición hasta la siguiente)
  const articulos = [];
  for (let i = 0; i < limites.length; i++) {
    const { numero, pos } = limites[i];
    const finPos = i + 1 < limites.length ? limites[i + 1].pos : texto.length;
    const textoArt = texto.substring(pos, finPos).replace(/^Artículo\s+\d+\.\d+\.\d+\./, '').trim();

    const subpartes = partirEnSubpartes(numero, textoArt);
    articulos.push(...subpartes);
  }

  // Deduplicar por número (conservar primera ocurrencia si hay repetidos legítimos)
  const vistos = new Map();
  const dedup = [];
  for (const a of articulos) {
    if (!vistos.has(a.numero)) {
      vistos.set(a.numero, true);
      dedup.push(a);
    }
  }
  console.log(`  ${dedup.length} artículos/secciones tras deduplicar (${articulos.length - dedup.length} duplicados eliminados)`);

  // Construir output con mismo schema que oguc.json pero código OGUC-X.Y.Z
  const secciones = dedup.map(a => ({
    codigo: `OGUC-${a.numero}`,
    numero: a.numero,
    texto:  a.texto,
  }));

  const output = {
    fuente: 'OGUC',
    ley: 'Ordenanza General de Urbanismo y Construcciones (OGUC)',
    decreto: 'DTO-47',
    ministerio: 'VIVIENDA',
    fecha_publicacion: '1992-06-05',
    ultima_version: '2026-06-24',
    total_articulos: secciones.length,
    secciones,
  };

  writeFileSync(SALIDA, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nGuardado: nacional/oguc_pdf.json (${secciones.length} secciones)`);

  // Reporte de los artículos más relevantes para DOM
  const relevantes = ['1.1.2', '2.1.1', '2.1.10', '2.1.24', '4.1.7', '4.2.2', '4.2.4', '4.2.5', '4.5.1', '4.5.7', '2.6.1', '5.5.1'];
  console.log('\nVerificación artículos clave:');
  for (const n of relevantes) {
    const found = secciones.filter(s => s.numero === n || s.numero.startsWith(n + '-'));
    console.log(`  ${n}: ${found.length > 0 ? found.length + ' sección(es)' : 'NO ENCONTRADO'}`);
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

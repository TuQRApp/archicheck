/**
 * _extraer_lguc.mjs — Extrae LGUC del PDF leychile.cl con regex.
 * Uso: node _extraer_lguc.mjs  (desde archicheck/normativa/)
 */
import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const PDF    = join(__dir, 'nacional/Fuentes/LGUC_DTO-458_13-ABR-1976.pdf');
const SALIDA = join(__dir, 'nacional/lguc_pdf.json');
const MAX_CHARS = 3000;

async function cargarPdfjs() {
  const pdfjsPath  = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const mod = await import(pathToFileURL(pdfjsPath).href);
  const pdfjs = mod.default ?? mod;
  (pdfjs.GlobalWorkerOptions ?? mod.GlobalWorkerOptions).workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

async function extraerTexto(pdfjs) {
  const buf = readFileSync(PDF);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  console.log(`  ${doc.numPages} páginas`);
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    paginas.push(c.items.map(it => it.str || '').join(' '));
  }
  let texto = paginas.join('\n');
  // Eliminar encabezado leychile
  texto = texto.replace(/Decreto 458, VIVIENDA \(\d+\)\s+Biblioteca del Congreso[^\n]*página \d+ de \d+/g, ' ');
  return texto.replace(/[ \t]{3,}/g, '  ').replace(/\n{3,}/g, '\n\n');
}

function partirLargo(numero, texto) {
  if (texto.length <= MAX_CHARS) return [{ numero, texto: texto.trim() }];
  const partes = [];
  let pos = 0, idx = 0;
  while (pos < texto.length) {
    let fin = Math.min(pos + MAX_CHARS, texto.length);
    if (fin < texto.length) {
      const corte = texto.lastIndexOf('\n', fin);
      if (corte > pos + MAX_CHARS / 2) fin = corte;
    }
    partes.push({
      numero: idx === 0 ? numero : `${numero}-${String.fromCharCode(97 + idx)}`,
      texto: texto.substring(pos, fin).trim(),
    });
    pos = fin; idx++;
  }
  return partes.filter(p => p.texto.length > 30);
}

async function main() {
  console.log('LGUC — Extracción desde PDF leychile.cl');
  const pdfjs = await cargarPdfjs();
  const texto = await extraerTexto(pdfjs);
  console.log(`  Texto total: ${Math.round(texto.length / 1000)} KB`);

  // LGUC usa "Artículo N°.-" o "Artículo N.-" (números simples)
  const RE_ART = /Artículo\s+(\d+)[°\s]*[\.\-]/g;
  const limites = [];
  let m;
  while ((m = RE_ART.exec(texto)) !== null) {
    limites.push({ numero: m[1], pos: m.index });
  }
  console.log(`  ${limites.length} artículos encontrados`);

  const articulos = [];
  for (let i = 0; i < limites.length; i++) {
    const { numero, pos } = limites[i];
    const finPos = i + 1 < limites.length ? limites[i + 1].pos : texto.length;
    const textoArt = texto.substring(pos, finPos).replace(/^Artículo\s+\d+[°\s]*[\.\-]/, '').trim();
    articulos.push(...partirLargo(numero, textoArt));
  }

  // Dedup: conservar primera ocurrencia
  const vistos = new Set();
  const dedup = articulos.filter(a => {
    if (vistos.has(a.numero)) return false;
    vistos.add(a.numero); return true;
  });
  console.log(`  ${dedup.length} secciones (${articulos.length - dedup.length} duplicados eliminados)`);

  const secciones = dedup.map(a => ({
    codigo: `LGUC-${a.numero}`,
    numero: a.numero,
    texto: a.texto,
  }));

  writeFileSync(SALIDA, JSON.stringify({
    fuente: 'LGUC',
    ley: 'Ley General de Urbanismo y Construcciones',
    decreto: 'DTO-458',
    ultima_version: '2026-06-24',
    total_articulos: secciones.length,
    secciones,
  }, null, 2), 'utf-8');
  console.log(`\nGuardado: nacional/lguc_pdf.json (${secciones.length} secciones)`);

  // Verificación artículos clave
  const claves = ['116', '116bis', '5', '55', '118', '142', '145'];
  console.log('\nArtículos clave:');
  claves.forEach(n => {
    const f = secciones.filter(s => s.numero === n || s.numero.startsWith(n + '-'));
    console.log(`  Art. ${n}: ${f.length > 0 ? f.length + ' sección(es)' : 'NO ENCONTRADO'}`);
  });
}

main().catch(e => { console.error(e.message); process.exit(1); });

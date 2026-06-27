/**
 * _extraer_prc_ordenanza.mjs — Extrae Ordenanza Refundida PRCP 2007 con regex.
 * Uso: node _extraer_prc_ordenanza.mjs  (desde archicheck/normativa/)
 */
import { readFileSync, writeFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const PDF    = join(__dir, 'providencia/ordenanza_refundida.pdf');
const SALIDA = join(__dir, 'providencia/ordenanza_refundida.json');
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
  // Eliminar encabezados de página: "Ordenanza Local Refundida PRCP 2007 – May 2025  N  "
  texto = texto.replace(/Ordenanza Local Refundida PRCP 2007[^\n]{0,40}\s+\d{1,3}\s+/g, ' ');
  return texto.replace(/[ \t]{3,}/g, '  ').replace(/\n{3,}/g, '\n\n');
}

function partirLargo(codigo, texto) {
  if (texto.length <= MAX_CHARS) return [{ codigo, texto: texto.trim() }];
  const partes = [];
  let pos = 0, idx = 0;
  while (pos < texto.length) {
    let fin = Math.min(pos + MAX_CHARS, texto.length);
    if (fin < texto.length) {
      const corte = texto.lastIndexOf('\n', fin);
      if (corte > pos + MAX_CHARS / 2) fin = corte;
    }
    partes.push({
      codigo: idx === 0 ? codigo : `${codigo}-${String.fromCharCode(97 + idx)}`,
      texto: texto.substring(pos, fin).trim(),
    });
    pos = fin; idx++;
  }
  return partes.filter(p => p.texto.length > 30);
}

async function main() {
  console.log('PRC Providencia — Ordenanza Refundida');
  const pdfjs = await cargarPdfjs();
  const texto = await extraerTexto(pdfjs);
  console.log(`  Texto total: ${Math.round(texto.length / 1000)} KB`);

  // Formato: "ART. X.Y.ZZ."
  const RE_ART = /ART\.\s+(\d+\.\d+\.\d+)\./g;
  const limites = [];
  let m;
  while ((m = RE_ART.exec(texto)) !== null) {
    limites.push({ codigo: `PRC-PRV-${m[1]}`, pos: m.index });
  }
  console.log(`  ${limites.length} artículos encontrados`);

  const articulos = [];
  for (let i = 0; i < limites.length; i++) {
    const { codigo, pos } = limites[i];
    const finPos = i + 1 < limites.length ? limites[i + 1].pos : texto.length;
    const textoArt = texto.substring(pos, finPos).replace(/^ART\.\s+\d+\.\d+\.\d+\./, '').trim();
    articulos.push(...partirLargo(codigo, textoArt));
  }

  const vistos = new Set();
  const dedup = articulos.filter(a => {
    if (vistos.has(a.codigo)) return false;
    vistos.add(a.codigo); return true;
  });
  console.log(`  ${dedup.length} secciones (${articulos.length - dedup.length} duplicados eliminados)`);

  writeFileSync(SALIDA, JSON.stringify({
    fuente: 'PRC-PRV',
    nombre: 'Plan Regulador Comunal de Providencia — Ordenanza Local Refundida 2007 (May 2025)',
    comuna: 'Providencia',
    region: 'Metropolitana',
    ultima_version: '2025-05',
    total_articulos: dedup.length,
    secciones: dedup,
  }, null, 2), 'utf-8');
  console.log(`\nGuardado: providencia/ordenanza_refundida.json (${dedup.length} secciones)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });

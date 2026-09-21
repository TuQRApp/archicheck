/**
 * _extraer_lguc.mjs — Extrae LGUC del PDF leychile.cl con regex.
 * Uso: node _extraer_lguc.mjs  (desde archicheck/normativa/)
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { extraerPaginas } from './extraer_texto_pdf.mjs';

const __dir  = dirname(fileURLToPath(import.meta.url));
const PDF    = join(__dir, 'nacional/Fuentes/LGUC_DTO-458_13-ABR-1976.pdf');
const SALIDA = join(__dir, 'nacional/lguc_pdf.json');
const MAX_CHARS = 3000;

// CORREGIDO 2026-09-21 (ACH-DATA-014): antes juntaba todos los items de texto
// en orden de lectura y sacaba el encabezado con un regex. Eso dejaba entrar la
// columna de referencias a decretos que el PDF imprime a la DERECHA de cada
// párrafo, intercalada dentro de las oraciones. Ahora el descarte es POSICIONAL
// —marginalia, encabezado y pie se van por dónde están impresos, no por cómo
// están escritos— y además se reconstruyen las líneas. La LGUC comparte maqueta
// con la OGUC (612x792, cuerpo en x=50..400). Ver extraer_texto_pdf.mjs.
async function extraerTexto() {
  const paginas = await extraerPaginas(PDF);
  console.log(`  ${paginas.length} páginas`);
  return paginas.join('\n');
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
  const texto = await extraerTexto();
  console.log(`  Texto total: ${Math.round(texto.length / 1000)} KB`);

  // LGUC usa "Artículo N°.-" o "Artículo N.-", y además una familia de
  // artículos agregados por leyes posteriores: "Artículo 2 bis.-",
  // "Artículo 28 quáter.-" y la serie con letra "Artículo 116 bis A).-" …
  // "Artículo 116 bis I.-" (9 artículos sobre torres de antenas).
  //
  // CORREGIDO 2026-09-21 (auditoría Fase 1, ACH-DATA-008): la versión anterior
  // exigía un "." o "-" inmediatamente después del número, así que un
  // encabezado "Artículo 2 bis.-" NO matcheaba en absoluto. Y como el corte de
  // cada artículo va desde su match hasta el siguiente, no crear el límite no
  // borraba el bis: le PEGABA su texto al artículo anterior. Verificado: el
  // Art. 2 traía dentro todo el Art. 2 bis, y el Art. 116 se comía el 116 bis
  // más la serie 116 bis A–I. Eso es peor que perderlo — el corpus del prompt
  // entregaba el texto del bis atribuido al número del artículo base.
  //
  // Se exige la A mayúscula a propósito: las referencias cruzadas dentro del
  // texto van en minúscula ("lo dispuesto en el artículo 116 bis"), y eso solo
  // ya las excluye. El "." o "-" final también sigue siendo obligatorio, por la
  // misma razón que en _extraer_oguc.mjs: sin él, el patrón matchea referencias
  // cruzadas escritas con mayúscula y genera cortes espurios.
  const RE_ART = /Artículo\s+(\d+)\s*[°º]?\s*(?:([bB]is|[tT]er|[qQ]u[áa]ter)\b\s*([A-I])?)?\s*\)?\s*[\.\-]/g;
  const limites = [];
  let m;
  while ((m = RE_ART.exec(texto)) !== null) {
    // Normalizado a "116 bis" / "28 quáter" / "116 bis A": un solo espacio,
    // sin el ")" del PDF. Así "116 bis" coincide con cómo lo escribe
    // articulos_prompt.json y queda distinto del artículo base.
    const numero = [m[1], m[2] && m[2].toLowerCase(), m[3]].filter(Boolean).join(' ');
    limites.push({ numero, pos: m.index });
  }
  console.log(`  ${limites.length} artículos encontrados`);

  const articulos = [];
  for (let i = 0; i < limites.length; i++) {
    const { numero, pos } = limites[i];
    const finPos = i + 1 < limites.length ? limites[i + 1].pos : texto.length;
    const textoArt = texto.substring(pos, finPos).replace(/^Artículo\s+\d+\s*[°º]?\s*(?:(?:[bB]is|[tT]er|[qQ]u[áa]ter)\b\s*[A-I]?)?\s*\)?\s*[\.\-]+/, '').trim();
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
  const claves = ['116', '116 bis', '116 bis A', '2 bis', '28 quáter', '5', '55', '118', '142', '145'];
  console.log('\nArtículos clave:');
  claves.forEach(n => {
    const f = secciones.filter(s => s.numero === n || s.numero.startsWith(n + '-'));
    console.log(`  Art. ${n}: ${f.length > 0 ? f.length + ' sección(es)' : 'NO ENCONTRADO'}`);
  });
}

main().catch(e => { console.error(e.message); process.exit(1); });

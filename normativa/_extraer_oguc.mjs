/**
 * _extraer_oguc.mjs
 * Extrae el OGUC directamente del PDF de leychile.cl usando regex sobre el texto.
 * NO usa Claude — la estructura decimal del OGUC lo permite.
 *
 * Uso: node _extraer_oguc.mjs
 * Desde: archicheck/normativa/
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { extraerPaginas } from './extraer_texto_pdf.mjs';
import { join, dirname } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const PDF    = join(__dir, 'nacional/Fuentes/OGUC_DTO-47_05-JUN-1992.pdf');
const SALIDA = join(__dir, 'nacional/oguc_pdf.json');

const MAX_CHARS = 3000; // máximo por chunk antes de partir

// ── Extracción de texto ────────────────────────────────────────────────────────
//
// CORREGIDO 2026-09-21 (ACH-DATA-014): antes esta función juntaba TODOS los
// items de texto de la página en orden de lectura y después intentaba sacar el
// ruido con regex. Eso arrastraba 2 problemas:
//
//   - la columna de referencias a decretos que el PDF imprime a la DERECHA de
//     cada párrafo quedaba INTERCALADA DENTRO DE LAS ORACIONES ("Los pasillos
//     tendrán un ancho Decreto 75, VIVIENDA libre mínimo de…"), en 565 de 770
//     secciones. Cada variante nueva había que descubrirla y agregarla a mano.
//   - para que esos regex pegaran había que aplanar los saltos de línea, y eso
//     destruía la estructura de filas de las tablas que SÍ están en la capa de
//     texto (la matriz del Art. 4.3.3 quedaba como una línea corrida).
//
// Ahora el descarte es POSICIONAL: se midió la distribución de palabras por
// coordenada x y hay un corte limpio —el cuerpo ocupa x=50..400 y en x>=440 no
// hay una sola palabra del articulado—, así que la marginalia, el encabezado y
// el pie se van por dónde están impresos, no por cómo están escritos. Ver
// extraer_texto_pdf.mjs.

async function extraerTextoCompleto(rutaPdf) {
  const paginas = await extraerPaginas(rutaPdf, {
    onProgreso: (i, n) => { if (i % 50 === 0) process.stdout.write(`  ${i}/${n}...\r`); },
  });
  console.log(`  ${paginas.length} páginas`);
  return paginas.join('\n');
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
  console.log('Extrayendo texto (descarte posicional de marginalia)...');
  const texto = await extraerTextoCompleto(PDF);
  console.log(`\n  Texto total: ${Math.round(texto.length / 1000)} KB`);

  // Detectar artículos: "Artículo X.Y.Z." y también "Artículo X.Y.Z. bis"
  //
  // CORREGIDO 2026-09-21 (auditoría Fase 1, ACH-DATA-008): la versión anterior
  // capturaba solo `\d+\.\d+\.\d+`, así que un encabezado "Artículo 2.1.3. bis"
  // se guardaba con el número "2.1.3" — el mismo que el artículo base. Y como
  // el dedup de más abajo conserva la PRIMERA ocurrencia, el artículo bis se
  // descartaba entero, en silencio. No se mezclaba con el base (el corte por
  // posición dejaba el texto del base correcto): simplemente desaparecía.
  //
  // El PDF usa 2 formatos: "Artículo 2.1.3. bis." y "Artículo 2.1.4. bis".
  // Las referencias cruzadas dentro del texto usan minúscula ("lo dispuesto en
  // el artículo 2.1.4. bis"), así que exigir la A mayúscula ya las excluye.
  //
  // OJO con el punto tras el número: es OBLIGATORIO a propósito. Un primer
  // intento lo hizo opcional (`\.?`) y eso rompió la extracción: paso a
  // matchear referencias cruzadas escritas con mayúscula ("el Artículo 2.1.4
  // de esta Ordenanza"), creando cortes espurios que se comieron un fragmento
  // real del Art. 2.1.4. Lo detectó el control de integridad que compara el
  // texto nuevo contra el anterior, no una lectura a ojo.
  // OJO con la CAJA de "bis": el PDF usa las dos. "Artículo 2.1.3. bis." en
  // minúscula y "Artículo 2.2.4. Bis." en MAYÚSCULA. La versión anterior solo
  // aceptaba minúscula, así que 2.2.4 Bis y 2.2.5 Bis se capturaban con el
  // número del artículo BASE y el dedup los descartaba enteros -- exactamente
  // el mismo mecanismo de ACH-DATA-008 que se creía cerrado. La "A" de
  // "Artículo" sí sigue exigiéndose en mayúscula, que es lo que excluye las
  // referencias cruzadas dentro del texto.
  //
  // El  tras el sufijo NO es decorativo: sin el, el "Ter" de "Artículo 3.4.1.
  // Terminadas las obras..." se tomaba como sufijo `ter` y el artículo BASE
  // desaparecía. Pasó con 3.4.1, 5.2.5 y 7.3.3; lo detectó el control que
  // compara los números de artículo antes y después.
  const RE_ART = /Artículo\s+(\d+\.\d+\.\d+)\.\s*([bB]is|[tT]er)?\b\.?/g;

  console.log('Detectando artículos...');
  const limites = [];
  let m;
  while ((m = RE_ART.exec(texto)) !== null) {
    // m[2] es "bis"/"ter" si el encabezado lo trae. Se normaliza a
    // "2.1.3 bis" (un solo espacio, sin el punto intermedio) para que el
    // número quede legible y distinto del artículo base.
    const numero = m[2] ? `${m[1]} ${m[2].toLowerCase()}` : m[1];
    limites.push({ numero, pos: m.index });
  }
  console.log(`  ${limites.length} artículos encontrados`);

  // Extraer texto de cada artículo (desde su posición hasta la siguiente)
  const articulos = [];
  for (let i = 0; i < limites.length; i++) {
    const { numero, pos } = limites[i];
    const finPos = i + 1 < limites.length ? limites[i + 1].pos : texto.length;
    const textoArt = texto.substring(pos, finPos)
      .replace(/^Artículo\s+\d+\.\d+\.\d+\.?\s*(?:[bB]is|[tT]er)?\b\.?/, '').trim();

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

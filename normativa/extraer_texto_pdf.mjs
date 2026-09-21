/**
 * extraer_texto_pdf.mjs
 *
 * Extrae el texto de un PDF de Ley Chile RESPETANDO LA MAQUETA: descarta por
 * posicion la columna de referencias a decretos y el pie de pagina, y
 * reconstruye las lineas para no destruir las tablas.
 *
 * POR QUE EXISTE (2026-09-21, ACH-DATA-014):
 * los PDF de leychile.cl traen 3 cosas que NO son el texto de la ley, mezcladas
 * con el en el orden de lectura:
 *
 *   1. La COLUMNA DE DECRETOS a la derecha ("Decreto 75, VIVIENDA / Art. UNICO
 *      N 62 / D.O. 25.06.2001"). Como esta a la derecha de cada parrafo, al
 *      extraer el texto plano queda INTERCALADA DENTRO DE LAS ORACIONES:
 *      "Los pasillos tendran un ancho Decreto 75, VIVIENDA libre minimo de..."
 *      Afectaba a 565 de 770 secciones.
 *   2. El encabezado arriba a la derecha ("Decreto 47, VIVIENDA (1992)").
 *   3. El pie de pagina ("Biblioteca del Congreso Nacional de Chile -
 *      www.leychile.cl - documento generado el ... pagina N de M").
 *
 * Hasta ahora esto se combatia con REGEX sobre el texto ya aplanado
 * (limpiar_texto_normativo.mjs). Funcionaba, pero con 2 costos:
 *   - habia que aplanar todos los saltos de linea para que los patrones
 *     pegaran, y eso destruia la estructura de filas de las tablas que SI
 *     estan en la capa de texto (la matriz de resistencia al fuego del Art.
 *     4.3.3 llegaba como una linea corrida). Era ACH-DATA-013.
 *   - cada variante nueva de marginalia habia que descubrirla y agregarla a
 *     mano; ya habian aparecido 2 tandas (numeros romanos, "VIVIENDA" huerfano).
 *
 * La maqueta lo resuelve de raiz: se midio la distribucion de palabras por
 * coordenada x y hay un corte limpio. El cuerpo ocupa x = 50..400; en x >= 440
 * NO hay una sola palabra del articulado, solo marginalia y encabezado.
 * Verificado sobre OGUC y LGUC, que comparten maqueta (612x792).
 */

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

/** A partir de esta x solo hay marginalia de decreto y encabezado. */
export const X_MARGINALIA = 440;
/** Por debajo de esta y esta el pie de pagina de la Biblioteca del Congreso. */
export const Y_PIE = 45;
/** Dos items con y dentro de esta tolerancia son la misma linea. */
const TOL_LINEA = 2.5;
/** Hueco horizontal (pt) a partir del cual 2 items de la misma linea son 2 palabras. */
const HUECO_ESPACIO = 0.6;

export async function cargarPdfjs() {
  const pdfjsPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
  const mod = await import(pathToFileURL(pdfjsPath).href);
  const pdfjs = mod.default ?? mod;
  const GO = pdfjs.GlobalWorkerOptions ?? mod.GlobalWorkerOptions;
  GO.workerSrc = pathToFileURL(workerPath).href;
  return pdfjs;
}

/**
 * Devuelve el texto de cada pagina, ya sin marginalia ni pie, con las lineas
 * reconstruidas.
 *
 * @param {string} rutaPdf
 * @param {{xMarginalia?: number, yPie?: number, onProgreso?: (i:number,n:number)=>void}} opciones
 * @returns {Promise<string[]>} una entrada por pagina
 */
export async function extraerPaginas(rutaPdf, opciones = {}) {
  const xMax = opciones.xMarginalia ?? X_MARGINALIA;
  const yMin = opciones.yPie ?? Y_PIE;

  const pdfjs = await cargarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(rutaPdf)) }).promise;

  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const contenido = await page.getTextContent();

    // Filtro POSICIONAL. Es lo que reemplaza a los regex de marginalia: no
    // depende de como este escrita la referencia al decreto, solo de donde
    // esta impresa.
    const items = contenido.items
      .filter(it => (it.str || '').length)
      .map(it => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, s: it.str }))
      .filter(it => it.x < xMax && it.y > yMin);

    // Reconstruccion de lineas: se agrupa por y (de arriba hacia abajo) y
    // dentro de cada linea se ordena por x. Asi una tabla dibujada con texto
    // conserva sus filas, que es lo que se perdia al aplanar.
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));

    const lineas = [];
    let actual = null;
    for (const it of items) {
      if (!actual || Math.abs(actual.y - it.y) > TOL_LINEA) {
        actual = { y: it.y, partes: [] };
        lineas.push(actual);
      }
      actual.partes.push(it);
    }

    // Dentro de una linea NO se puede pegar los items a secas: pdfjs a veces
    // parte una palabra en 2 items (ahi hay que unir sin nada) y a veces omite
    // el item de espacio entre 2 palabras (ahi hay que insertarlo). Se decide
    // por el HUECO horizontal real entre el fin de un item y el inicio del
    // siguiente. Sin esto quedan palabras pegadas: se detectaron 89 casos
    // ("litoraln", "interiorn") comparando contra la extraccion anterior.
    const texto = lineas
      .map(l => {
        const partes = l.partes.sort((a, b) => a.x - b.x);
        let linea = '';
        let finPrevio = null;
        for (const p of partes) {
          if (finPrevio !== null && p.x - finPrevio > HUECO_ESPACIO && !/\s$/.test(linea) && !/^\s/.test(p.s)) {
            linea += ' ';
          }
          linea += p.s;
          finPrevio = p.x + p.w;
        }
        return linea.trimEnd();
      })
      .filter(l => l.trim().length)
      .join('\n');

    paginas.push(texto);
    if (opciones.onProgreso) opciones.onProgreso(n, doc.numPages);
  }
  return paginas;
}

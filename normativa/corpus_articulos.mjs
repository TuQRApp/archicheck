/**
 * corpus_articulos.mjs
 *
 * Reconstruye el texto COMPLETO de cada articulo a partir de las secciones de
 * `*_pdf.json`, reuniendo el articulo con sus continuaciones (`-b`, `-c`, ...).
 *
 * POR QUE EXISTE (hallazgo 2026-09-21, ACH-DATA-012):
 * el extractor parte los articulos largos en chunks de <=3000 chars, numerados
 * `4.2.4`, `4.2.4-b`, `4.2.4-c`... Tanto el generador del corpus del prompt
 * como su test hacian `map.get("4.2.4")`, que devuelve SOLO EL PRIMER CHUNK.
 * O sea: de los articulos que se inyectan al modelo se descartaba en silencio
 * todo lo que pasara de 3000 caracteres -- el 52% del texto seleccionado.
 *
 * Casos concretos que eso rompia:
 *   - Art. 1.1.2 (definiciones): 20 secciones, se entregaba 1. Al modelo le
 *     faltaba el ~95% del glosario del que depende todo el analisis.
 *   - Art. 4.2.4: la TABLA DE CARGOS DE OCUPACION vive en `4.2.4-b`. El chunk
 *     entregado termina justo en "se calculara de acuerdo a la siguiente
 *     tabla:" y ahi se cortaba.
 *   - Art. 2.6.3: la tabla de distanciamientos vive en `2.6.3-b`.
 *   - LGUC Art. 116: se entregaban 3.000 de sus 9.269 caracteres.
 *
 * Es la MISMA clase de defecto que el truncado a 220 chars que se elimino en
 * ACH-DATA-007, pero un nivel mas abajo y mucho menos visible: el texto que
 * llegaba era oficial y estaba limpio, solo que era un pedazo. Y el test
 * compartia el defecto con el generador (los dos hacian el mismo `.get()`),
 * asi que daba el corpus por bueno.
 *
 * Por eso esta funcion es el UNICO punto por donde se debe leer un articulo:
 * si el generador y el test comparten el acceso, no pueden volver a
 * desincronizarse en la misma direccion.
 */

/** Sufijo de continuacion: "" -> 0, "-b" -> 2, "-c" -> 3 ... */
function ordenDeParte(numero) {
  const m = String(numero).match(/-([a-z])$/);
  return m ? m[1].charCodeAt(0) - 96 : 0;
}

/** Numero base de un chunk: "4.2.4-b" -> "4.2.4", "116 bis-b" -> "116 bis". */
export function numeroBase(numero) {
  return String(numero).trim().replace(/-[a-z]$/, '');
}

/**
 * Indexa las secciones por numero de articulo, con el texto COMPLETO.
 * @param {{numero: string, texto: string}[]} secciones
 * @returns {Map<string, string>}
 */
export function indexarArticulos(secciones) {
  const partes = new Map();
  for (const s of secciones) {
    const base = numeroBase(s.numero);
    if (!partes.has(base)) partes.set(base, []);
    partes.get(base).push(s);
  }

  const indice = new Map();
  for (const [base, lista] of partes) {
    // Orden documental: primero la seccion sin sufijo, despues -b, -c, ...
    lista.sort((a, b) => ordenDeParte(a.numero) - ordenDeParte(b.numero));
    indice.set(base, lista.map(s => s.texto).join('\n'));
  }
  return indice;
}

/**
 * limpiar_texto_normativo.mjs
 *
 * Saca la metadata de decreto que el PDF de Ley Chile imprime en el MARGEN y
 * que la extraccion a texto termina intercalando DENTRO de las oraciones.
 *
 * Por que existe (hallazgo 2026-09-21, repasada de la auditoria Fase 1):
 * el texto extraido de la OGUC se ve asi --
 *
 *   "Los pasillos tendran un ancho Decreto 75, VIVIENDA libre minimo de medio
 *    centimetro por persona, calculado Art. UNICO N 62 conforme a la carga de
 *    ocupacion de la superficie D.O. 25.06.2001 servida, con un ancho minimo
 *    de 1,10 m."
 *
 * 565 de las 770 secciones de OGUC tienen este ruido. Impacto real medido, no
 * teorico: el prompt de produccion truncaba cada articulo a 220 caracteres, y
 * en el Art. 4.2.18 el requisito ("1,10 m") cae en el caracter 222 -- o sea que
 * el ruido empujaba el numero JUSTO fuera del corte y el modelo nunca lo veia.
 * El mismo texto sucio alimenta los 1.608 chunks del RAG en Supabase.
 *
 * Es deliberadamente conservador: solo saca patrones de citas de modificacion
 * (Decreto N, VIVIENDA / Art. UNICO N X / D.O. dd.mm.aaaa), que son marginalia
 * editorial, nunca contenido normativo. No toca numeros, medidas ni referencias
 * a otros articulos dentro del texto ("conforme al articulo 4.2.5").
 */

const PATRONES_RUIDO = [
  // "Decreto 75, VIVIENDA" / "Decreto 217," -- cita del decreto modificatorio
  /Decreto\s+\d+,\s*VIVIENDA/gi,
  /Decreto\s+\d+,(?=\s)/gi,
  // "D.O. 25.06.2001" -- fecha de publicacion en el Diario Oficial
  /D\.\s*O\.\s*\d{2}\.\d{2}\.\d{4}/gi,
  // "Art. UNICO Nº 62" / "Art. unico N° 23, . 24.1" / "Art. PRIMERO Nº 56".
  // Acepta numeracion arabiga Y ROMANA ("Art. unico N° IV", "Art. UNICO Nº VII"):
  // la version que solo contemplaba digitos dejaba residuos en 5 articulos
  // -- lo detecto test_articulos_prompt.mjs, no una lectura a ojo.
  /Art\.\s*(?:UNICO|ÚNICO|unico|único|PRIMERO|primero|SEGUNDO|segundo)\s*N[º°]?\s*(?:\d+(?:\s*[.,]\s*\d+)*|[IVXLC]+)/gi,
  // "Art. 1 Nº 14" -- misma marginalia, con numero de articulo del decreto
  /Art\.\s*\d+\s*N[º°]\s*\d+/gi,
  // "LEY 20016" / "Ley N 20.071" cuando aparece suelta como marginalia
  /\bLEY\s+\d{4,5}\b/g,
  // "VIVIENDA" huerfano. La extraccion a veces PARTE la anotacion marginal en
  // dos y mete texto real en el medio: el Art. 1.1.2 crudo dice
  //   "Decreto 29, «Altura de edificacion»: la distancia vertical, VIVIENDA
  //    expresada en metros..."
  // Al sacar "Decreto 29," queda el "VIVIENDA" incrustado en plena oracion.
  // Se excluye "DE VIVIENDA" para no romper "MINISTERIO DE VIVIENDA Y URBANISMO",
  // que si es contenido legitimo.
  /(?<!DE\s)\bVIVIENDA\b/g,
];

/**
 * Limpia un texto normativo extraido del PDF. Devuelve string.
 *
 * CAMBIO 2026-09-21 (ACH-DATA-014): ahora PRESERVA LOS SALTOS DE LINEA.
 *
 * Antes empezaba con `.replace(/\s+/g, ' ')`, que aplanaba todo. Se hacia por
 * necesidad: la marginalia venia intercalada dentro de las oraciones y los
 * patrones de abajo solo pegaban sobre texto plano. El costo era que las
 * tablas que SI estan en la capa de texto perdian su estructura de filas --
 * la matriz de resistencia al fuego del Art. 4.3.3 llegaba al modelo como una
 * linea corrida (era ACH-DATA-013).
 *
 * Ya no hace falta: la marginalia se descarta POR POSICION en la extraccion
 * (extraer_texto_pdf.mjs), asi que el texto llega limpio y con sus lineas.
 * Medido despues del cambio: LGUC 0 de 264 secciones con residuo, OGUC 7 de
 * 758 -- y esas 7 son falsos positivos sobre bloques "NOTA" que si son
 * contenido legitimo del texto refundido.
 *
 * Los patrones quedan como RED DE SEGURIDAD, no como el mecanismo principal.
 */
export function limpiarTextoNormativo(texto) {
  // Espacios horizontales se colapsan; los saltos de linea se conservan.
  let t = String(texto ?? '').replace(/[^\S\n]+/g, ' ');
  for (const re of PATRONES_RUIDO) t = t.replace(re, ' ');
  return t
    .replace(/ +([,;.])/g, '$1')      // espacio suelto antes de puntuacion
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * true si al texto todavia le queda marginalia despues de limpiar.
 *
 * OJO con la CAJA de "VIVIENDA": es lo que distingue la marginalia del
 * contenido. El margen del PDF imprime "Decreto 75, VIVIENDA" en mayusculas;
 * los bloques NOTA del texto refundido -- que son contenido legitimo -- dicen
 * "Decreto 57, Vivienda, publicado el 06.04.2023". Con el test case-insensitive
 * los 7 unicos "residuos" que quedan en OGUC son justamente esos NOTA, es
 * decir falsos positivos que harian fallar al test por texto correcto.
 */
export function tieneRuidoResidual(texto) {
  const t = String(texto ?? '');
  if (/Decreto\s+\d+,\s*VIVIENDA\b/.test(t)) return true;               // sensible a mayusculas
  if (/Art\.\s*(?:UNICO|ÚNICO)\s*N/.test(t)) return true;
  // "D.O. dd.mm.aaaa" es marginalia salvo cuando el texto lo esta citando
  // ("publicado el ..."), caso en que forma parte de la oracion.
  return /(?<!publicado el\s)D\.\s*O\.\s*\d{2}\.\d{2}\.\d{4}/.test(t);
}

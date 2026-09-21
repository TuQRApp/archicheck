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

/** Limpia un texto normativo extraido del PDF. Devuelve string. */
export function limpiarTextoNormativo(texto) {
  let t = String(texto ?? '').replace(/\s+/g, ' ');
  for (const re of PATRONES_RUIDO) t = t.replace(re, ' ');
  return t
    .replace(/\s+([,;.])/g, '$1')   // espacio suelto antes de puntuacion
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** true si al texto todavia le queda marginalia despues de limpiar. */
export function tieneRuidoResidual(texto) {
  const t = String(texto ?? '');
  return /Decreto\s+\d+,\s*VIVIENDA|D\.\s*O\.\s*\d{2}\.\d{2}\.\d{4}|Art\.\s*(?:UNICO|ÚNICO|unico|único)\s*N/i.test(t);
}

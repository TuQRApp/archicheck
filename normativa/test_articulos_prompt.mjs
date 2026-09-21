/**
 * test_articulos_prompt.mjs
 *
 * Verifica que el corpus normativo que src/App.jsx inyecta en el prompt de
 * produccion siga siendo el texto OFICIAL, y no una copia editada a mano.
 *
 * Es el test que le faltaba al proyecto. Sin el, el 2026-09-21 se descubrio
 * que de los 53 articulos inyectados bajo el titulo "NORMATIVA NACIONAL
 * VIGENTE" solo 23 coincidian con el texto real: habia texto FABRICADO
 * atribuido a articulos reales (el Art. 4.5.7 "exigia" 1/6 de superficie de
 * ventana cuando en realidad regula patios escolares; el 4.2.2 "trataba" de
 * escaleras cuando trata de cambio de destino) y 5 PLACEHOLDERS de LGUC que
 * decian "[Articulo N - consultar texto completo en BCN]". De ese 1/6
 * inventado salio la cadena de citas falsas que se venia corrigiendo rio abajo,
 * una por una, sin encontrar el origen.
 *
 * Uso: node test_articulos_prompt.mjs
 * Sale con codigo 1 si algo no coincide -- pensado para correr en CI.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { limpiarTextoNormativo, tieneRuidoResidual } from './limpiar_texto_normativo.mjs';
import { indexarArticulos } from './corpus_articulos.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const cargar = p => JSON.parse(readFileSync(join(__dir, p), 'utf-8'));

// Los anexos graficos (contenido que en el PDF solo existe como imagen) no se
// pueden comparar contra la capa de texto, asi que se verifican contra su
// propia fuente: anexos_transcripciones.json. El punto es el mismo que el de
// ACH-DATA-007 -- que nadie pueda escribir a mano una tabla en el archivo
// generado y que pase por normativa oficial.
const transcripciones = cargar('anexos_transcripciones.json');

const CASOS = [
  { nombre: 'OGUC', prompt: 'nacional/oguc_articulos.json', fuente: 'nacional/oguc_pdf.json' },
  { nombre: 'LGUC', prompt: 'nacional/lguc_articulos.json', fuente: 'nacional/lguc_pdf.json' },
];

let fallas = 0;
let verificados = 0;
let anexosOk = 0;

for (const caso of CASOS) {
  const inyectado = cargar(caso.prompt);
  const pdf = cargar(caso.fuente);
  // MISMO acceso que usa el generador, a proposito. Antes cada uno armaba su
  // propio Map con `.get(numero)` y los dos compartian el mismo punto ciego:
  // se quedaban con el primer chunk del articulo, asi que el test daba por
  // bueno un corpus truncado al 48%. Ver ACH-DATA-012.
  const real = indexarArticulos(pdf.secciones);

  console.log(`\n=== ${caso.nombre} ===`);

  for (const [num, art] of Object.entries(inyectado.articulos)) {
    const oficial = real.get(String(num).trim());

    if (!oficial) {
      console.error(`  FALLA  Art. ${num}: no existe en ${caso.fuente}.`);
      fallas++;
      continue;
    }
    const esperado = limpiarTextoNormativo(oficial);
    if (art.texto !== esperado) {
      console.error(`  FALLA  Art. ${num}: el texto NO coincide con el oficial.`);
      console.error(`         inyectado: ${JSON.stringify(String(art.texto).slice(0, 90))}…`);
      console.error(`         oficial  : ${JSON.stringify(esperado.slice(0, 90))}…`);
      fallas++;
      continue;
    }
    // Un placeholder nunca deberia volver a colarse.
    if (/\[Art[ií]culo\s.*(consultar|BCN)/i.test(art.texto)) {
      console.error(`  FALLA  Art. ${num}: es un PLACEHOLDER, no texto normativo.`);
      fallas++;
      continue;
    }
    if (tieneRuidoResidual(art.texto)) {
      console.error(`  FALLA  Art. ${num}: quedo marginalia de decreto sin limpiar.`);
      fallas++;
      continue;
    }
    // Anexos graficos: cada uno debe existir en anexos_transcripciones.json,
    // con el mismo contenido. Asi un anexo no puede nacer de una edicion a mano
    // del archivo generado.
    for (const anexo of art.anexos || []) {
      const origen = (transcripciones.anexos || []).find(
        a => a.corpus === caso.nombre &&
             String(a.articulo).trim() === String(num).trim() &&
             a.titulo === anexo.titulo);
      if (!origen) {
        console.error(`  FALLA  Art. ${num}: anexo "${anexo.titulo}" no existe en anexos_transcripciones.json.`);
        fallas++;
        continue;
      }
      if (origen.contenido !== anexo.contenido) {
        console.error(`  FALLA  Art. ${num}: el anexo "${anexo.titulo}" no coincide con su transcripcion de origen.`);
        fallas++;
        continue;
      }
      if (!origen.imagenes || !origen.imagenes.length || !origen.pdf) {
        console.error(`  FALLA  Art. ${num}: el anexo "${anexo.titulo}" no declara procedencia (pdf + imagenes).`);
        fallas++;
        continue;
      }
      anexosOk++;
    }
    verificados++;
  }
  console.log(`  ${Object.keys(inyectado.articulos).length} articulos revisados.`);
}

console.log(`
${verificados} articulos verificados contra el texto oficial, ${anexosOk} anexo(s) grafico(s) contra su transcripcion, ${fallas} fallas.`);

if (fallas > 0) {
  console.error('\nEl corpus del prompt NO coincide con el texto oficial.');
  console.error('Si el cambio es intencional, regeneralo: node normativa/generar_articulos_prompt.mjs');
  process.exit(1);
}
console.log('OK: el prompt de produccion solo inyecta texto normativo oficial.');

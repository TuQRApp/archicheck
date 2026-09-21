/**
 * generar_articulos_prompt.mjs
 *
 * Regenera nacional/oguc_articulos.json y nacional/lguc_articulos.json -- los 2
 * archivos que src/App.jsx inyecta en el prompt de produccion bajo el titulo
 * "NORMATIVA NACIONAL VIGENTE".
 *
 * POR QUE EXISTE (hallazgo 2026-09-21, repasada de la auditoria Fase 1):
 * esos 2 archivos eran una copia del texto normativo mantenida A MANO. De los
 * 53 articulos que inyectaban, solo 23 tenian texto que coincidiera con el
 * oficial. Los otros 30 eran:
 *   - texto FABRICADO atribuido a un numero de articulo real. Ejemplos
 *     verificados uno por uno contra el PDF oficial: el JSON decia que el
 *     Art. 4.2.2 trata de anchos de escalera (el real trata de cambio de
 *     destino), y que el Art. 4.5.7 exige "1/6 de la superficie de piso" de
 *     ventana (el real regula patios de locales escolares, y ese 1/6 no existe
 *     en ninguno de los 770 articulos). Ese 1/6 inventado es el origen de la
 *     cadena de citas falsas que el proyecto venia corrigiendo rio abajo.
 *   - PLACEHOLDERS: 5 articulos de LGUC (57, 58, 60, 119, 120) cuyo "texto"
 *     era literalmente "[Articulo N - consultar texto completo en BCN]",
 *     mientras el checklist del prompt le pedia al modelo verificarlos.
 *
 * QUE CAMBIA: el texto ya no se escribe a mano, se DERIVA de la extraccion
 * verbatim del PDF oficial (nacional/*_pdf.json) y se limpia con
 * limpiar_texto_normativo.mjs. Lo unico que se mantiene a mano es QUE
 * articulos incluir y con que etiqueta de tema -- y eso lo verifica el test
 * test_articulos_prompt.mjs, que falla si el archivo generado no coincide.
 *
 * Uso:  node generar_articulos_prompt.mjs            (regenera)
 *       node generar_articulos_prompt.mjs --check    (solo verifica, no escribe)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { limpiarTextoNormativo } from './limpiar_texto_normativo.mjs';
import { indexarArticulos } from './corpus_articulos.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SOLO_CHECK = process.argv.includes('--check');

// La LISTA de que articulos incluir vive en su propio archivo
// (articulos_prompt.json), no dentro del archivo generado. Antes el generador
// leia la lista del mismo archivo que escribia -- circular: para cambiar la
// seleccion habia que editar a mano el archivo derivado, que es justo lo que
// este mecanismo existe para evitar. Ahora lo que se revisa y se versiona es
// una lista corta de {numero, tema}; el texto lo pone el PDF oficial.
const LISTA = 'articulos_prompt.json';

const CUERPOS = [
  {
    nombre: 'OGUC',
    destino: 'nacional/oguc_articulos.json',
    fuente: 'nacional/oguc_pdf.json',
    meta: { fuente: 'oguc', nombre: 'Ordenanza General de Urbanismo y Construcciones' },
  },
  {
    nombre: 'LGUC',
    destino: 'nacional/lguc_articulos.json',
    fuente: 'nacional/lguc_pdf.json',
    meta: { fuente: 'lguc', nombre: 'Ley General de Urbanismo y Construcciones' },
  },
];

function cargar(p) {
  return JSON.parse(readFileSync(join(__dir, p), 'utf-8'));
}

let huboProblemas = false;

const lista = cargar(LISTA);

for (const cuerpo of CUERPOS) {
  const actual = cargar(cuerpo.destino);
  const pdf = cargar(cuerpo.fuente);
  // indexarArticulos reune cada articulo con sus continuaciones (-b, -c...).
  // Antes aca habia un `new Map(secciones.map(...))` + `.get(numero)`, que
  // devolvia SOLO EL PRIMER CHUNK: se descartaba el 52% del texto de los
  // articulos seleccionados, en silencio. Ver ACH-DATA-012.
  const real = indexarArticulos(pdf.secciones);

  const salida = {};
  const noEncontrados = [];

  for (const entrada of lista[cuerpo.nombre]) {
    const clave = String(entrada.numero).replace(/[°º]/g, '').trim();
    const texto = real.get(clave);

    if (!texto) {
      noEncontrados.push(entrada.numero);
      continue;
    }
    salida[clave] = {
      tema: entrada.tema,
      texto: limpiarTextoNormativo(texto),
    };
  }

  const nuevo = {
    ...cuerpo.meta,
    // Deja explicito que esto es generado -- para que nadie lo edite a mano
    // otra vez y vuelva a aparecer texto inventado.
    _generado_por: 'normativa/generar_articulos_prompt.mjs',
    _fuente_texto: cuerpo.fuente + ' (extraccion verbatim del PDF oficial), limpiado con limpiar_texto_normativo.mjs',
    _no_editar_a_mano: 'El texto se deriva del PDF oficial. Para agregar o sacar un articulo, edita la lista y volve a correr el generador.',
    ultima_version: actual.ultima_version,
    articulos: salida,
  };

  const destinoAbs = join(__dir, cuerpo.destino);
  const serializado = JSON.stringify(nuevo, null, 2) + '\n';
  const previo = readFileSync(destinoAbs, 'utf-8');

  console.log(`\n=== ${cuerpo.nombre} ===`);
  console.log(`  articulos en la lista : ${lista[cuerpo.nombre].length}`);
  console.log(`  con texto oficial     : ${Object.keys(salida).length}`);
  if (noEncontrados.length) {
    console.log(`  NO hallados en el PDF : ${noEncontrados.length} -> ${noEncontrados.join(', ')}`);
  }

  if (SOLO_CHECK) {
    if (previo !== serializado) {
      console.log('  ESTADO: DESINCRONIZADO -- el archivo no coincide con lo que genera este script.');
      huboProblemas = true;
    } else {
      console.log('  ESTADO: en sincronia.');
    }
  } else {
    writeFileSync(destinoAbs, serializado, 'utf-8');
    console.log('  escrito.');
  }
}

if (SOLO_CHECK && huboProblemas) {
  console.error('\nFALLA: hay archivos desincronizados. Corre: node normativa/generar_articulos_prompt.mjs');
  process.exit(1);
}

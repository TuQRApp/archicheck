// Clasificacion de taxonomia multidimensional para normativa_chunks.metadata
// (Proyecto/Backlog_Macro.md item 8, ejecutado 2026-09-21).
//
// FUENTE UNICA para esta logica -- tanto indexar_normativa.mjs (carga
// inicial/re-indexado) como backfill_metadata.mjs (actualiza filas ya
// cargadas sin tocar embeddings) importan de aca. No duplicar esta funcion
// en ningun otro archivo -- exactamente el tipo de duplicacion que ya causo
// problemas reales hoy (reglas_verificacion.json vs. nacional/schema.sql
// con las mismas 12 reglas desincronizadas).
//
// Ver normativa/taxonomia_articulos.json para la tabla de datos, y
// normativa/migracion_taxonomia_metadata.sql para el DDL relacionado
// (match_normativa() extendida + indice GIN).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Cache por ruta (fix Revision Ing SW Paso 2, Codex 2026-09-21): antes era
// una unica variable global que ignoraba `ruta` en llamadas posteriores --
// si algun caller pasaba una ruta distinta a la del primer call en el mismo
// proceso (ej. un test que apunta a una taxonomia de prueba), recibia en
// silencio la taxonomia cacheada del primer call, no la que pidio.
const _taxonomiaCachePorRuta = new Map();
export function cargarTaxonomia(ruta = join(__dir, 'taxonomia_articulos.json')) {
  if (!_taxonomiaCachePorRuta.has(ruta)) {
    _taxonomiaCachePorRuta.set(ruta, JSON.parse(readFileSync(ruta, 'utf-8')));
  }
  return _taxonomiaCachePorRuta.get(ruta);
}

function numeroDesdeCodigo(fuente, codigo) {
  // "OGUC-4.1.7" -> "4.1.7" ; "OGUC-4.1.7-b" -> "4.1.7" ; "OGUC-4.1.7-pt2" -> "4.1.7"
  // "LGUC-116" -> "116" ; "LGUC-116-e" -> "116"
  const sinPrefijo = codigo.replace(new RegExp(`^${fuente}-`), '');
  const m = sinPrefijo.match(/^(\d+(?:\.\d+)*)/);
  return m ? m[1] : null;
}

function capituloDesdeNumero(numero) {
  // "4.1.7" -> "4.1" ; "116" -> null (LGUC no se organiza en capitulos X.Y)
  const partes = numero.split('.');
  if (partes.length >= 2) return `${partes[0]}.${partes[1]}`;
  return null;
}

/**
 * Clasifica un chunk de normativa segun su fuente/codigo, devolviendo los
 * campos de taxonomia a mezclar dentro de `metadata` (nunca reemplaza
 * metadata entero -- el llamador hace `{ ...metadataExistente, ...resultado }`).
 *
 * @param {string} fuente - 'OGUC' | 'LGUC' | 'LEY19300' | 'DDU' | 'PRC-<sufijo>'
 * @param {string} codigo - codigo completo del chunk, ej. 'OGUC-4.1.7-b'
 * @param {object} metadataExistente - metadata ya presente en la fila (para
 *   leer pistas como metadata.ddu o metadata.comuna sin perderlas)
 */
export function clasificar(fuente, codigo, metadataExistente = {}, taxonomia = cargarTaxonomia()) {
  const numero = numeroDesdeCodigo(fuente, codigo);
  // vigencia='vigente' por default -- justificado SOLO para OGUC/LGUC/
  // LEY19300 (extraccion directa del texto de ley vigente, oguc_pdf.json/
  // lguc_pdf.json, tratado como actual salvo derogacion puntual conocida).
  // Hallazgo real de Revision Ing SW Paso 2 (DeepSeek, 2026-09-21): esto
  // NUNCA se sobreescribia para DDU/PRC, dejando 1608/1608 filas en
  // 'vigente' incluidas ~270 circulares DDU y ~281 filas PRC-PRV -- pese a
  // que taxonomia_articulos.json._default_ddu.nota dice literalmente
  // "vigencia debe revisarse caso a caso", el campo nunca reflejaba eso.
  // p_solo_vigentes (migracion_taxonomia_metadata.sql) filtraba sobre un
  // campo que en la practica no discriminaba nada. Se corrige marcando
  // 'sin_verificar' en las ramas DDU/PRC de abajo (nunca se verifico
  // vigencia real caso a caso todavia -- ver auditoria de integridad
  // normativa: Providencia 86% sin procesar, 3 circulares DDU fabricadas
  // encontradas y ya eliminadas).
  const base = {
    clasificacion_metodo: 'heuristica_no_verificada',
    vigencia: 'vigente', vigencia_fecha: null,
    ambito: 'nacional', comuna: null, zona: null,
    canal: 'ambos', etapa_pipeline: [],
  };

  if (fuente === 'OGUC' && numero) {
    if (taxonomia.articulos[numero]) {
      return { ...base, ...taxonomia.articulos[numero], clasificacion_metodo: 'verificado' };
    }
    const cap = capituloDesdeNumero(numero);
    if (cap && taxonomia.capitulos_fallback[cap]) {
      return { ...base, ...taxonomia.capitulos_fallback[cap] };
    }
    return { ...base, ...taxonomia.capitulos_fallback._default_oguc };
  }

  if (fuente === 'LGUC') {
    if (numero && taxonomia.articulos[numero]) {
      return { ...base, ...taxonomia.articulos[numero], clasificacion_metodo: 'verificado' };
    }
    return { ...base, ...taxonomia.capitulos_fallback._default_lguc };
  }

  if (fuente === 'LEY19300') {
    return { ...base, ...taxonomia.capitulos_fallback._default_ley19300 };
  }

  if (fuente === 'DDU') {
    const ddu = metadataExistente?.ddu;
    if (ddu === '351') {
      return { ...base, vigencia: 'sin_verificar', tipo_norma: ['accesibilidad', 'circulacion'], tipo_edificacion: ['todos'], etapa_pipeline: ['OBS-N01', 'OBS-N02', 'OBS-N03', 'OBS-N04'], jerarquia: 'piso_nacional_no_derogable', clasificacion_metodo: 'verificado' };
    }
    if (ddu === '447') {
      return { ...base, vigencia: 'sin_verificar', tipo_norma: ['procedimiento', 'urbanistica'], tipo_edificacion: ['todos'], jerarquia: 'piso_nacional_no_derogable', clasificacion_metodo: 'verificado', nota: 'aportes al espacio publico -- sin contenido dimensional geometrico, ver Convenciones_BIM.md seccion E' };
    }
    // DDU Libro Completo (552 circulares compiladas, no leidas una por una todavia)
    return { ...base, vigencia: 'sin_verificar', ...taxonomia.capitulos_fallback._default_ddu };
  }

  if (fuente.startsWith('PRC')) {
    // Hallazgo real (backfill 2026-09-21): la fuente real en la tabla es
    // 'PRC-PRV' (Providencia), no 'PRC' a secas -- el primer intento de
    // este clasificador asumio 'PRC' exacto y esas 281 filas cayeron al
    // fallback generico vacio (ambito='nacional' incorrecto) hasta que se
    // detecto releyendo una fila real despues del primer backfill.
    const sufijo = fuente.replace(/^PRC-?/, '').toLowerCase();
    const comunaMap = { prv: 'providencia', stgo: 'santiago', nun: 'nunoa' };
    const comuna = comunaMap[sufijo] || (metadataExistente?.comuna || '').toLowerCase() || null;
    // Fix Revision Ing SW Paso 2 (DeepSeek+Codex, 2026-09-21, hallazgo
    // coincidente de ambos): un PRC futuro con sufijo no mapeado y sin
    // metadata.comuna quedaba en ambito='comunal'+comuna=null EN SILENCIO
    // -- el chunk existe, pasa el filtro p_ambito='comunal', pero nunca
    // aparece en ninguna consulta por comuna especifica porque comuna=null
    // no calza ningun p_comuna real. A diferencia del bug real de PRC-PRV
    // (ambito mal puesto, ruidoso -- se detecto solo), este modo de falla
    // es silencioso -- se marca explicito para que no pase desapercibido.
    if (!comuna) {
      console.warn(`clasificar(): PRC sin comuna mapeada (fuente="${fuente}") -- agregar a comunaMap o pasar metadata.comuna, o esta fila nunca aparecera en una consulta por comuna especifica.`);
      return { ...base, vigencia: 'sin_verificar', ...taxonomia.capitulos_fallback._default_prc, ambito: 'comunal', comuna: null, clasificacion_metodo: 'error_comuna_no_mapeada' };
    }
    return { ...base, vigencia: 'sin_verificar', ...taxonomia.capitulos_fallback._default_prc, ambito: 'comunal', comuna };
  }

  return base;
}

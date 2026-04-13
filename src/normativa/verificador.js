import normasNunoa    from "../../normativa/nunoa/normas_edificacion.json";
import patrimonioNunoa from "../../normativa/nunoa/patrimonio.json";

// ── Índices por comunaId ────────────────────────────────────────────────────
const NORMAS = { nunoa: normasNunoa };

const PATRIMONIO = {
  nunoa: patrimonioNunoa.reduce((acc, p) => { acc[p.id] = p; return acc; }, {}),
};

// Prioridad de instrumentos (mayor índice = mayor prioridad)
const PRIORIDAD = { zona: 0, ZT: 1, ZCH: 2, MH: 3, ICH: 4, restriccion: 5 };

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n, decimals = 2) =>
  n == null ? "—" : Number(n).toFixed(decimals).replace(/\.?0+$/, "");

function resultado(parametro, propuesto, limiteNormativo, cumple, observacion, referencia) {
  return { parametro, propuesto: String(propuesto), limiteNormativo: String(limiteNormativo), cumple, observacion, referencia };
}

/**
 * Resuelve las normas efectivas para un predio dados zona y eventuales instrumentos patrimoniales.
 * La prioridad es ICH > ZT > MH > ZCH > zona.
 *
 * @param {string} zonaId       - ej: 'Z-3'
 * @param {string|null} patriId - ej: 'MH-1', 'ZT-4', null
 * @param {string} comunaId
 * @returns {{ normas: object, instrumento: string, ref: string }}
 */
function resolverNormas(zonaId, patriId, comunaId) {
  const zonas    = NORMAS[comunaId]     ?? {};
  const patriMap = PATRIMONIO[comunaId] ?? {};

  const normZona = zonas[zonaId];
  if (!normZona) return { normas: null, instrumento: "zona", ref: zonaId };

  if (patriId && patriMap[patriId]) {
    const p = patriMap[patriId];
    const tipo = p.tipo; // MH | ZT | ZCH | ICH
    // Las normas patrimoniales sobreescriben la zona
    const normas = {
      subdivision_predial_minima_m2:  p.subdivision_predial_minima_m2  ?? normZona.subdivision_predial_minima_m2,
      coef_ocupacion_suelo:           p.coef_ocupacion_suelo           ?? normZona.coef_ocupacion_suelo,
      coef_constructibilidad:         p.coef_constructibilidad         ?? normZona.coef_constructibilidad,
      altura_maxima_m:                p.altura_maxima_m                ?? normZona.altura_maxima_m,
      altura_maxima_pisos:            p.altura_maxima_pisos            ?? normZona.altura_maxima_pisos,
      antejardín_m:                   null, // antejardín patrimonial es textual
      densidad_bruta_maxima_hab_ha:   p.densidad_bruta_maxima_hab_ha   ?? normZona.densidad_bruta_maxima_hab_ha,
    };
    return {
      normas,
      instrumento: tipo,
      ref: `${tipo} ${patriId} PRC Ñuñoa — ${p.nombre}`,
    };
  }

  return {
    normas: normZona,
    instrumento: "zona",
    ref: `Art. 26 PRC Ñuñoa — Zona ${zonaId}`,
  };
}

// ── Verificador principal ───────────────────────────────────────────────────

/**
 * Verifica un proyecto contra la normativa.
 *
 * @param {object} proyecto
 * @param {number} [proyecto.superficieTerreno]     - m²
 * @param {number} [proyecto.cosProyectado]         - coeficiente, ej: 0.55
 * @param {number} [proyecto.ccProyectado]          - coeficiente, ej: 1.8
 * @param {number} [proyecto.alturaM]               - metros
 * @param {number} [proyecto.pisosProyectados]      - cantidad
 * @param {number} [proyecto.antejardínProyectado]  - metros
 * @param {number} [proyecto.densidadProyectada]    - hab/há
 * @param {number} [proyecto.anchoCalleFrentera]    - metros (para Art. 18)
 *
 * @param {string} zonaId    - ej: 'Z-3'
 * @param {string} [comunaId='nunoa']
 * @param {string} [patriId=null] - instrumento patrimonial si aplica, ej: 'MH-1'
 *
 * @returns {Array<{parametro,propuesto,limiteNormativo,cumple,observacion,referencia}>}
 */
export function verificarProyecto(proyecto, zonaId, comunaId = "nunoa", patriId = null) {
  const { normas, ref } = resolverNormas(zonaId, patriId, comunaId);
  if (!normas) {
    return [resultado("Zona", zonaId, "—", false, `Zona "${zonaId}" no encontrada en la normativa de ${comunaId}.`, "—")];
  }

  const resultados = [];
  const {
    superficieTerreno,
    cosProyectado,
    ccProyectado,
    alturaM,
    pisosProyectados,
    antejardínProyectado,
    densidadProyectada,
    anchoCalleFrentera,
  } = proyecto;

  // 1. Subdivisión predial mínima
  if (superficieTerreno != null && normas.subdivision_predial_minima_m2 != null) {
    const limite = normas.subdivision_predial_minima_m2;
    const cumple = superficieTerreno >= limite;
    resultados.push(resultado(
      "Subdivisión predial mínima",
      `${fmt(superficieTerreno, 0)} m²`,
      `≥ ${fmt(limite, 0)} m²`,
      cumple,
      cumple ? "Cumple subdivisión predial mínima." : `El terreno (${fmt(superficieTerreno, 0)} m²) es inferior al mínimo de ${fmt(limite, 0)} m² exigido.`,
      ref,
    ));
  }

  // 2. COS
  if (cosProyectado != null && normas.coef_ocupacion_suelo != null) {
    const limite = normas.coef_ocupacion_suelo;
    const cumple = cosProyectado <= limite;
    resultados.push(resultado(
      "Coeficiente de Ocupación de Suelo (COS)",
      fmt(cosProyectado, 2),
      `≤ ${fmt(limite, 2)}`,
      cumple,
      cumple ? "COS dentro del límite normativo." : `COS proyectado (${fmt(cosProyectado, 2)}) excede el máximo permitido de ${fmt(limite, 2)}.`,
      ref,
    ));
  }

  // 3. CC
  if (ccProyectado != null && normas.coef_constructibilidad != null) {
    const limite = normas.coef_constructibilidad;
    const cumple = ccProyectado <= limite;
    resultados.push(resultado(
      "Coeficiente de Constructibilidad (CC)",
      fmt(ccProyectado, 2),
      `≤ ${fmt(limite, 2)}`,
      cumple,
      cumple ? "CC dentro del límite normativo." : `CC proyectado (${fmt(ccProyectado, 2)}) excede el máximo permitido de ${fmt(limite, 2)}.`,
      ref,
    ));
  }

  // 4. Altura en metros
  if (alturaM != null && normas.altura_maxima_m != null) {
    const limite = normas.altura_maxima_m;
    const cumple = alturaM <= limite;
    resultados.push(resultado(
      "Altura máxima (metros)",
      `${fmt(alturaM, 1)} m`,
      `≤ ${fmt(limite, 1)} m`,
      cumple,
      cumple ? "Altura en metros dentro del límite." : `Altura proyectada (${fmt(alturaM, 1)} m) supera el máximo de ${fmt(limite, 1)} m.`,
      ref,
    ));
  }

  // 5. Altura en pisos
  if (pisosProyectados != null && normas.altura_maxima_pisos != null) {
    const limite = normas.altura_maxima_pisos;
    const cumple = pisosProyectados <= limite;
    resultados.push(resultado(
      "Altura máxima (pisos)",
      `${pisosProyectados} pisos`,
      `≤ ${limite} pisos`,
      cumple,
      cumple ? "Número de pisos dentro del límite." : `Pisos proyectados (${pisosProyectados}) superan el máximo de ${limite} pisos.`,
      ref,
    ));
  }

  // 6. Antejardín
  if (antejardínProyectado != null && normas.antejardín_m != null) {
    const limite = normas.antejardín_m;
    const cumple = antejardínProyectado >= limite;
    resultados.push(resultado(
      "Antejardín",
      `${fmt(antejardínProyectado, 1)} m`,
      `≥ ${fmt(limite, 1)} m`,
      cumple,
      cumple ? "Antejardín cumple el mínimo." : `Antejardín proyectado (${fmt(antejardínProyectado, 1)} m) es inferior al mínimo de ${fmt(limite, 1)} m.`,
      ref,
    ));
  }

  // 7. Densidad bruta
  if (densidadProyectada != null && normas.densidad_bruta_maxima_hab_ha != null) {
    const limite = normas.densidad_bruta_maxima_hab_ha;
    const cumple = densidadProyectada <= limite;
    resultados.push(resultado(
      "Densidad bruta máxima",
      `${fmt(densidadProyectada, 0)} hab/há`,
      `≤ ${fmt(limite, 0)} hab/há`,
      cumple,
      cumple ? "Densidad dentro del límite." : `Densidad proyectada (${fmt(densidadProyectada, 0)} hab/há) supera el máximo de ${fmt(limite, 0)} hab/há.`,
      ref,
    ));
  }

  // 8. Regla calle ≤ 12m (Art. 18 PRC Ñuñoa)
  if (anchoCalleFrentera != null && anchoCalleFrentera <= 12) {
    const refArt18 = "Art. 18 PRC Ñuñoa — Calle frentera ≤ 12m";
    if (pisosProyectados != null) {
      const cumple = pisosProyectados <= 3;
      resultados.push(resultado(
        "Art. 18 — Pisos (calle ≤ 12m)",
        `${pisosProyectados} pisos`,
        "≤ 3 pisos",
        cumple,
        cumple ? "Cumple restricción Art. 18 en número de pisos." : `Frente a calle ≤ 12m: máximo 3 pisos. Proyectado: ${pisosProyectados}.`,
        refArt18,
      ));
    }
    if (alturaM != null) {
      const cumple = alturaM <= 8;
      resultados.push(resultado(
        "Art. 18 — Altura en metros (calle ≤ 12m)",
        `${fmt(alturaM, 1)} m`,
        "≤ 8 m",
        cumple,
        cumple ? "Cumple restricción Art. 18 en altura." : `Frente a calle ≤ 12m: máximo 8 m. Proyectado: ${fmt(alturaM, 1)} m.`,
        refArt18,
      ));
    }
    if (ccProyectado != null) {
      const cumple = ccProyectado <= 1.0;
      resultados.push(resultado(
        "Art. 18 — CC (calle ≤ 12m)",
        fmt(ccProyectado, 2),
        "≤ 1.00",
        cumple,
        cumple ? "Cumple restricción Art. 18 en CC." : `Frente a calle ≤ 12m: CC máximo 1.0. Proyectado: ${fmt(ccProyectado, 2)}.`,
        refArt18,
      ));
    }
  }

  return resultados;
}

/**
 * Retorna las normas crudas de una zona para mostrar en UI.
 * @param {string} zonaId
 * @param {string} [comunaId='nunoa']
 * @param {string|null} [patriId=null]
 */
export function obtenerNormas(zonaId, comunaId = "nunoa", patriId = null) {
  const { normas, instrumento, ref } = resolverNormas(zonaId, patriId, comunaId);
  return { normas, instrumento, ref };
}

/**
 * Lista las zonas disponibles de una comuna.
 * @param {string} [comunaId='nunoa']
 * @returns {Array<{ id, nombre, tipo }>}
 */
export function listarZonas(comunaId = "nunoa") {
  const normas = NORMAS[comunaId];
  if (!normas) return [];
  return Object.values(normas).map(z => ({ id: z.id, nombre: z.nombre, tipo: z.tipo }));
}

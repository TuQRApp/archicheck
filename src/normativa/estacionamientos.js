import reglasNunoa from "../../normativa/nunoa/estacionamientos.json";

// Índice de reglas por comunaId
const REGLAS_POR_COMUNA = { nunoa: reglasNunoa.reglas };

const c = Math.ceil;
const mx = Math.max;

/**
 * Evalúa una fórmula de estacionamientos.
 * Soporta: ceil(), max(), +, *, /, constantes numéricas y variables.
 * @param {string} formula
 * @param {{ sup?, personas?, unidades?, dormitorios?, vehiculos? }} vars
 * @returns {number}
 */
function evalFormula(formula, vars) {
  if (!formula || formula === "0") return 0;
  const { sup = 0, personas = 0, unidades = 0, dormitorios = 0, vehiculos = 0 } = vars;
  try {
    // eslint-disable-next-line no-new-func
    return Math.max(0, Math.round(new Function(
      "sup", "personas", "unidades", "dormitorios", "vehiculos", "ceil", "max",
      `return ${formula};`
    )(sup, personas, unidades, dormitorios, vehiculos, c, mx)));
  } catch {
    return 0;
  }
}

/**
 * Calcula estacionamientos requeridos.
 * @param {string} destinoId  - id de la regla (ej: 'restaurante')
 * @param {{ sup?, personas?, unidades?, dormitorios? }} params
 * @param {string} [comunaId='nunoa']
 * @returns {{ vehiculos: number, bicicletas: number, regla: object|null }}
 */
export function calcularEstacionamientos(destinoId, params = {}, comunaId = "nunoa") {
  const reglas = REGLAS_POR_COMUNA[comunaId];
  if (!reglas) return { vehiculos: 0, bicicletas: 0, regla: null };

  const regla = reglas.find(r => r.id === destinoId);
  if (!regla) return { vehiculos: 0, bicicletas: 0, regla: null };

  const vehiculos = evalFormula(regla.formula_vehiculos, params);
  const bicicletas = evalFormula(regla.formula_bicicletas, { ...params, vehiculos });

  return { vehiculos, bicicletas, regla };
}

/**
 * Lista todas las reglas de una comuna.
 * @param {string} [comunaId='nunoa']
 * @returns {Array}
 */
export function listarReglas(comunaId = "nunoa") {
  return REGLAS_POR_COMUNA[comunaId] ?? [];
}

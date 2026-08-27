import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import SelectorComuna from './components/SelectorComuna.jsx';
import { verificarProyecto, listarZonas, COMUNAS_CON_VERIFICACION } from './normativa/verificador.js';
import ogucArticulos from "../normativa/nacional/oguc_articulos.json";
import lgucArticulos from "../normativa/nacional/lguc_articulos.json";
import ley19300Articulos from "../normativa/nacional/ley19300_articulos.json";
import reglasNacionales from "../normativa/nacional/reglas_verificacion.json";
import nunoa_normas from "../normativa/nunoa/normas_edificacion.json";
import nunoa_meta from "../normativa/nunoa/metadata.json";
import santiago_normas from "../normativa/santiago/normas_edificacion.json";
import santiago_meta from "../normativa/santiago/metadata.json";
import providencia_normas from "../normativa/providencia/normas_edificacion.json";
import providencia_meta from "../normativa/providencia/metadata.json";

const PRC_COMUNAS = {
  nunoa:       { meta: nunoa_meta,       normas: nunoa_normas },
  santiago:    { meta: santiago_meta,    normas: santiago_normas },
  providencia: { meta: providencia_meta, normas: providencia_normas },
};
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const WORKER_URL = import.meta.env.VITE_WORKER_URL;

// ── Tipos de proyecto ──────────────────────────────────────────────────────
const TIPOS = [
  { id: "obra_nueva",   label: "Obra Nueva" },
  { id: "ampliacion",   label: "Ampliación" },
  { id: "remodelacion", label: "Remodelación" },
  { id: "obra_menor",   label: "Obra Menor" },
  { id: "obra_publica", label: "Obra Pública" },
  { id: "equipamiento", label: "Equipamiento" },
];

const TIPOS_DOC = [
  "Plano de emplazamiento", "Planta arquitectura", "Cortes y elevaciones",
  "Memoria descriptiva", "Especificaciones técnicas", "Formulario MINVU",
  "Certificado de Informaciones Previas", "Memoria de cálculo estructural",
  "Planos de instalaciones", "Presupuesto de obras", "Otro",
];


const OBS_ACTIONS = [
  { id:"aceptada",   label:"✅ Aceptar",   color:"#1E8449" },
  { id:"comentada",  label:"💬 Comentar",  color:"#2952A3" },
  { id:"modificada", label:"✏️ Modificar", color:"#D68910" },
  { id:"descartada", label:"🗑️ Descartar", color:"#6B7A99" },
];
const STATUS_LABELS = { aceptada:"Aceptada", comentada:"Comentada", modificada:"Modificada", descartada:"Descartada" };
const STATUS_COLORS = { aceptada:"#1E8449", comentada:"#2952A3", modificada:"#D68910", descartada:"#6B7A99" };

const ETAPAS = [
  { id:"e1",     dot:"1", label:"Separación Gráfica",      capa:"c1" },
  { id:"e2",     dot:"2", label:"Reconocimiento",           capa:"c1" },
  { id:"e3",     dot:"3", label:"Vectorización",            capa:"c1" },
  { id:"e4",     dot:"4", label:"Modelo Estructural",       capa:"c1" },
  { id:"n1",     dot:"A", label:"Recintos y Superficies",   capa:"c2" },
  { id:"n2",     dot:"B", label:"Circulaciones",            capa:"c2" },
  { id:"n3",     dot:"C", label:"Iluminación y Ventilación",capa:"c2" },
  { id:"n4",     dot:"D", label:"Normativa Urbanística",    capa:"c2" },
  { id:"n5",     dot:"E", label:"Consolidación",            capa:"c2" },
  { id:"report", dot:"★", label:"Informe Final",            capa:"c2" },
];

const TH = { padding:"8px 12px", textAlign:"left", color:"#fff", fontWeight:600, fontSize:11, background:"#1B3A8A", whiteSpace:"nowrap" };
const TD = { padding:"8px 12px", borderBottom:"1px solid #EEF2FB", fontSize:12, color:"#3D4A5C" };

// Mapa etapa (string que devuelve el modelo en tabla_observaciones[].observaciones[].etapas)
// -> ruta de la sección cruda donde se pinta el EtapaRefs de esa pantalla.
const ETAPA_SECTION = {
  "Separación":     ["capa1", "separacion"],
  "Reconocimiento": ["capa1", "reconocimiento"],
  "Vectorización":  ["capa1", "vectorizacion"],
  "Modelo":         ["capa1", "modelo"],
  "Recintos":       ["capa2", "recintos_superficies"],
  "Circulaciones":  ["capa2", "circulaciones"],
  "Iluminación":    ["capa2", "iluminacion_ventilacion"],
  "Urbanística":    ["capa2", "normativa_urbanistica"],
};

// Lista plana y deduplicada de observaciones: fuente única de verdad para
// conteos, tabla por tema y detalle del consolidado — todas provienen de
// tabla_observaciones (ya deduplicada por el modelo), nunca de las
// observaciones crudas por etapa (que sí pueden repetirse entre secciones).
function getConsolidado(result) {
  const out = [];
  (result?.tabla_observaciones || []).forEach((grupo, ti) => {
    (grupo.observaciones || []).forEach((obs, oi) => {
      out.push({ obs, key:`t${ti}-${oi}`, tema:grupo.tema, etapas:obs.etapas || [] });
    });
  });
  return out;
}

function assignObsCodes(result) {
  for (const [c1, c2] of Object.values(ETAPA_SECTION)) {
    const sec = result[c1]?.[c2];
    if (sec) sec._refs = [];
  }
  let iIdx = 1, oIdx = 1;
  for (const { obs, etapas } of getConsolidado(result)) {
    if (!obs._codigo)
      obs._codigo = obs.criticidad === "ALTA" ? `I${iIdx++}` : `O${oIdx++}`;
    for (const etapaLabel of etapas) {
      const [c1, c2] = ETAPA_SECTION[etapaLabel] || [];
      const sec = c1 && result[c1]?.[c2];
      if (sec && !sec._refs.includes(obs._codigo)) sec._refs.push(obs._codigo);
    }
  }
}

// Letra en sans-serif + número en monoespaciado: la "O" de mayúscula nunca se
// confunde con el dígito "0" (el problema persiste si sólo se distingue por color).
function CodigoBadge({ codigo, size = 10, pill = true }) {
  if (!codigo) return null;
  const isInc = codigo[0] === "I";
  const color = isInc ? "#C0392B" : "#D68910";
  const style = pill
    ? { background:isInc ? "rgba(192,57,43,0.08)" : "rgba(214,137,16,0.08)", border:`1px solid ${isInc ? "rgba(192,57,43,0.3)" : "rgba(214,137,16,0.3)"}`, borderRadius:4, padding:"1px 6px" }
    : { whiteSpace:"nowrap" };
  return (
    <span style={{ display:"inline-flex", fontWeight:800, fontSize:size, color, lineHeight:1.3, ...style }}>
      <span style={{ fontFamily:"Arial,Helvetica,sans-serif" }}>{codigo[0]}</span>
      <span style={{ fontFamily:"'DM Mono',monospace" }}>{codigo.slice(1)}</span>
    </span>
  );
}

function EtapaRefs({ refs }) {
  if (!refs?.length) return null;
  return (
    <div style={{ marginTop:10, padding:"8px 12px", background:"#F8F9FF", borderRadius:6, border:"1px solid #E0E6F3", display:"flex", alignItems:"center", flexWrap:"wrap", gap:4 }}>
      <span style={{ fontSize:11, color:"#6B7A99", marginRight:4, flexShrink:0 }}>Hallazgos →</span>
      {refs.map(code => <CodigoBadge key={code} codigo={code} size={10} />)}
      <span style={{ fontSize:9, color:"#B8C5E0", marginLeft:4 }}>ver consolidado ↓</span>
    </div>
  );
}

// ── Reparar JSON cortado ───────────────────────────────────────────────────
function repairJSON(str) {
  // Elimina trailing parcial: coma suelta al final antes de cerrar
  let s = str.trimEnd();

  // Cierra string abierto: cuenta comillas no escapadas
  let inString = false;
  let lastStringStart = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== "\\")) {
      inString = !inString;
      if (inString) lastStringStart = i;
    }
  }
  if (inString) {
    // Trunca hasta antes del string abierto incompleto y cierra
    s = s.slice(0, lastStringStart) + '""';
  }

  // Elimina coma final suelta antes de } o ]
  s = s.replace(/,\s*$/, "");

  // Apila los contenedores abiertos
  const stack = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && (i === 0 || s[i - 1] !== "\\")) { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }

  // Elimina coma suelta de nuevo por si el truncado la dejó
  s = s.replace(/,\s*$/, "");

  // Cierra en orden inverso
  s += stack.reverse().join("");
  return s;
}

function repairAndParse(str) {
  // Intento 1: parseo directo
  try { return JSON.parse(str); } catch (_) { /* continúa */ }

  // Intento 2: reparación
  try { return JSON.parse(repairJSON(str)); } catch (_) { /* continúa */ }

  // Intento 3: datos parciales — extrae campos de primer nivel que sí llegaron
  const partial = {};
  const fields = ["capa2","capa1","analisis_por_archivo","resumen_general","tabla_observaciones","estado_global","alertas_especiales","pasos_siguientes","documentos_faltantes"];
  for (const field of fields) {
    const m = str.match(new RegExp(`"${field}"\\s*:\\s*("([^"\\\\]|\\\\.)*"|\\d+|\\[|\\{)`));
    if (m) {
      try {
        const start = str.indexOf(`"${field}"`);
        const valStart = str.indexOf(":", start) + 1;
        partial[field] = JSON.parse(repairJSON(str.slice(valStart).trimStart().replace(/,?\s*$/, "")));
      } catch (_) { partial[field] = "⚠ dato parcial"; }
    }
  }
  if (!partial.resumen_general) partial.resumen_general = "⚠ Respuesta recibida incompleta — datos parciales.";
  if (!partial.estado_global)   partial.estado_global   = "OBSERVADO";
  if (!partial.tabla_observaciones) partial.tabla_observaciones = [];
  if (!partial.analisis_por_archivo) partial.analisis_por_archivo = [];
  if (!partial.documentos_faltantes) partial.documentos_faltantes = [];
  if (!partial.alertas_especiales)   partial.alertas_especiales   = [];
  if (!partial.pasos_siguientes)     partial.pasos_siguientes     = [];
  if (!partial.capa1 || typeof partial.capa1 === "string") partial.capa1 = {};
  if (!partial.capa2 || typeof partial.capa2 === "string") partial.capa2 = {};
  return partial;
}

// ── Leer stream SSE de un modelo ────────────────────────────────────────────
async function readModelStream(resp) {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await resp.json();
    throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let raw = "", sseBuffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") raw += evt.delta.text;
        if (evt.type === "error") throw new Error(evt.error?.message || JSON.stringify(evt.error));
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  }
  return raw;
}

// ── Helpers de merge de texto/arrays (usados por mergeResults y por el ensamble semántico) ──
const MERGE_STOP = new Set(["el","la","los","las","un","una","de","del","en","y","o","a","se","que","es","no","con","por","para","al","lo","su","sus"]);
function mergeWordsOf(s) {
  return new Set((s || "").toLowerCase().split(/\W+/).filter(w => w.length > 3 && !MERGE_STOP.has(w)));
}
function mergeObsSimilar(a, b) {
  const wa = mergeWordsOf(a.descripcion), wb = mergeWordsOf(b.descripcion);
  let n = 0; wb.forEach(w => { if (wa.has(w)) n++; });
  return n >= 3;
}
function mergeObs(a = [], b = []) {
  const out = [...a];
  for (const obs of b) if (!out.some(ex => mergeObsSimilar(ex, obs))) out.push(obs);
  return out;
}
function dedupeArr(a = [], b = []) {
  const seen = new Set(a.map(s => String(s).trim().toLowerCase()));
  return [...a, ...b.filter(s => !seen.has(String(s).trim().toLowerCase()))];
}

// ── Ensamble semántico: comparación de tablas entre Claude y GPT-4o ─────────
// Antes, mergeSection elegía la tabla "más larga" completa y descartaba la otra entera —
// perdía filas que solo un modelo detectó y nunca mostraba cuando ambos SÍ emparejaban el
// mismo recinto/elemento pero discrepaban en el veredicto (cumple/estado). Ver Convenciones_CAD.md
// D.11 y roadmap (2026-08-24) para el diseño completo y la corrección de fondo que lo motivó.
// Ningún modelo emite un ID estructurado por fila (el código [E##] solo se pide dentro del texto
// libre de "descripcion") — el emparejamiento es por nombre normalizado con fuzzy match, no por ID.
function normalizarNombreItem(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function nombresCoinciden(a, b) {
  const na = normalizarNombreItem(a), nb = normalizarNombreItem(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(" ").filter(w => w.length > 2);
  const wb = nb.split(" ").filter(w => w.length > 2);
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (!shorter.length) return false;
  return shorter.every(w => longer.includes(w));
}
// Empareja 2 tablas por keyField (nombre difuso, ej. "recinto"/"elemento"/"parametro").
// - Fila emparejada, mismo veredicto → se fusiona en silencio (como antes).
// - Fila emparejada, veredicto distinto → discrepancia real, NINGUNO se descarta.
// - Fila sin par → se incluye igual en la tabla final (antes se perdía si su tabla
//   completa era la más corta), marcada como detectada por un solo modelo.
function compararTablas(t1 = [], t2 = [], keyField, verdictField, origen) {
  const usados2 = new Array(t2.length).fill(false);
  const merged = [];
  const discrepancias = [];

  for (const r1 of t1) {
    let idxMatch = -1;
    for (let i = 0; i < t2.length; i++) {
      if (usados2[i]) continue;
      if (nombresCoinciden(r1[keyField], t2[i][keyField])) { idxMatch = i; break; }
    }
    if (idxMatch >= 0) {
      usados2[idxMatch] = true;
      const r2 = t2[idxMatch];
      if (verdictField && r1[verdictField] != null && r2[verdictField] != null
          && String(r1[verdictField]).trim().toUpperCase() !== String(r2[verdictField]).trim().toUpperCase()) {
        discrepancias.push({ tabla: origen, item: r1[keyField], campo: verdictField, valor_claude: r1[verdictField], valor_gpt4o: r2[verdictField] });
      }
      // Base = fila de Claude; completa con campos de GPT-4o que Claude dejó vacíos/nulos.
      merged.push({ ...r1, ...Object.fromEntries(Object.entries(r2).filter(([k, v]) => (r1[k] == null || r1[k] === "") && v != null)) });
    } else {
      merged.push({ ...r1, _detectado_por: "claude" });
      discrepancias.push({ tabla: origen, item: r1[keyField], campo: "_presencia", valor_claude: "detectado", valor_gpt4o: "no detectado" });
    }
  }
  t2.forEach((r2, i) => {
    if (usados2[i]) return;
    merged.push({ ...r2, _detectado_por: "gpt4o" });
    discrepancias.push({ tabla: origen, item: r2[keyField], campo: "_presencia", valor_claude: "no detectado", valor_gpt4o: "detectado" });
  });

  return { merged, discrepancias };
}
// Igual que mergeSection, pero para tablas con identidad de fila (recinto/elemento/parametro) —
// usa compararTablas en vez de "gana el más largo" y acumula discrepancias en discAcc.
function mergeSeccionConComparacion(s1 = {}, s2 = {}, tableKey, keyField, verdictField, origen, discAcc) {
  const t1 = s1[tableKey] || [], t2 = s2[tableKey] || [];
  const { merged, discrepancias } = compararTablas(t1, t2, keyField, verdictField, origen);
  discAcc.push(...discrepancias);
  const base = { ...(t1.length >= t2.length ? s1 : s2) };
  base.observaciones = mergeObs(s1.observaciones, s2.observaciones);
  base[tableKey] = merged;
  return base;
}
// recintos_por_nivel es un array de niveles, cada uno con su propio array de recintos —
// primero empareja niveles por nombre (ej. "Nivel 1" vs "Piso 1"), después compara los
// recintos dentro de cada par de niveles emparejado con la misma lógica de compararTablas.
function mergeRecintosPorNivel(r1Sec = {}, r2Sec = {}, discAcc) {
  const niv1 = r1Sec.recintos_por_nivel || [];
  const niv2 = r2Sec.recintos_por_nivel || [];
  const usados2 = new Array(niv2.length).fill(false);
  const nivelesMerged = [];

  for (const n1 of niv1) {
    let idxMatch = -1;
    for (let i = 0; i < niv2.length; i++) {
      if (usados2[i]) continue;
      if (nombresCoinciden(n1.nivel, niv2[i].nivel)) { idxMatch = i; break; }
    }
    if (idxMatch >= 0) {
      usados2[idxMatch] = true;
      const n2 = niv2[idxMatch];
      const { merged, discrepancias } = compararTablas(n1.recintos || [], n2.recintos || [], "nombre", "estado", `Recintos ${n1.nivel || ""}`.trim());
      discAcc.push(...discrepancias);
      nivelesMerged.push({ ...n1, recintos: merged });
    } else {
      nivelesMerged.push(n1);
      discAcc.push({ tabla: "Recintos por nivel", item: n1.nivel, campo: "_presencia", valor_claude: "detectado", valor_gpt4o: "no detectado" });
    }
  }
  niv2.forEach((n2, i) => {
    if (usados2[i]) return;
    nivelesMerged.push(n2);
    discAcc.push({ tabla: "Recintos por nivel", item: n2.nivel, campo: "_presencia", valor_claude: "no detectado", valor_gpt4o: "detectado" });
  });
  return nivelesMerged;
}

// ── Merge de resultados de dos modelos ──────────────────────────────────────
// mergeWordsOf/mergeObs/dedupeArr viven a nivel de módulo (arriba) — las usan tanto esta función
// como mergeSeccionConComparacion/mergeRecintosPorNivel del ensamble semántico.
function mergeResults(r1, r2) {
  function mergeSection(s1 = {}, s2 = {}, tableKey) {
    const t1 = tableKey ? (s1[tableKey] || []) : [];
    const t2 = tableKey ? (s2[tableKey] || []) : [];
    const base = { ...(t1.length >= t2.length ? s1 : s2) };
    base.observaciones = mergeObs(s1.observaciones, s2.observaciones);
    if (tableKey) base[tableKey] = t1.length >= t2.length ? t1 : t2;
    return base;
  }

  const RANK = { APROBADO: 0, OBSERVADO: 1, RECHAZADO: 2 };
  const estado = (RANK[r1.estado_global] ?? 1) >= (RANK[r2.estado_global] ?? 1) ? r1.estado_global : r2.estado_global;

  // Acumula discrepancias reales (veredicto distinto o detectado por un solo modelo) de todas
  // las tablas con identidad de fila — ver Convenciones_CAD.md D.11 para el diseño completo.
  const discrepancias_ensamble = [];

  const rec1 = r1.capa1?.reconocimiento || {}, rec2 = r2.capa1?.reconocimiento || {};
  const recSec = { ...((rec1.recintos_por_nivel || []).length >= (rec2.recintos_por_nivel || []).length ? rec1 : rec2) };
  recSec.observaciones = mergeObs(rec1.observaciones, rec2.observaciones);
  recSec.recintos_por_nivel = mergeRecintosPorNivel(rec1, rec2, discrepancias_ensamble);
  recSec.stats = {
    recintos_total: Math.max(rec1.stats?.recintos_total || 0, rec2.stats?.recintos_total || 0),
    niveles:        Math.max(rec1.stats?.niveles        || 0, rec2.stats?.niveles        || 0),
    observaciones:  recSec.observaciones?.length || 0,
  };

  return {
    tabla_observaciones:  (r1.tabla_observaciones?.length || 0) >= (r2.tabla_observaciones?.length || 0) ? (r1.tabla_observaciones || []) : (r2.tabla_observaciones || []),
    estado_global:        estado,
    resumen_general:      (r1.resumen_general?.length || 0) >= (r2.resumen_general?.length || 0) ? r1.resumen_general : r2.resumen_general,
    analisis_por_archivo: (r1.analisis_por_archivo?.length || 0) >= (r2.analisis_por_archivo?.length || 0) ? (r1.analisis_por_archivo || []) : (r2.analisis_por_archivo || []),
    documentos_faltantes: dedupeArr(r1.documentos_faltantes, r2.documentos_faltantes),
    alertas_especiales:   dedupeArr(r1.alertas_especiales,   r2.alertas_especiales),
    pasos_siguientes:     dedupeArr(r1.pasos_siguientes,     r2.pasos_siguientes).slice(0, 6),
    discrepancias_ensamble,
    capa1: {
      separacion:     mergeSection(r1.capa1?.separacion     || {}, r2.capa1?.separacion     || {}, "capas"),
      reconocimiento: recSec,
      vectorizacion:  mergeSection(r1.capa1?.vectorizacion  || {}, r2.capa1?.vectorizacion  || {}, "elementos"),
      modelo:         mergeSection(r1.capa1?.modelo         || {}, r2.capa1?.modelo         || {}, null),
    },
    capa2: {
      recintos_superficies:   mergeSeccionConComparacion(r1.capa2?.recintos_superficies   || {}, r2.capa2?.recintos_superficies   || {}, "tabla", "recinto",   "cumple", "Recintos y superficies",     discrepancias_ensamble),
      circulaciones:           mergeSeccionConComparacion(r1.capa2?.circulaciones           || {}, r2.capa2?.circulaciones           || {}, "tabla", "elemento",  "cumple", "Circulaciones",              discrepancias_ensamble),
      iluminacion_ventilacion: mergeSeccionConComparacion(r1.capa2?.iluminacion_ventilacion || {}, r2.capa2?.iluminacion_ventilacion || {}, "tabla", "recinto",   "cumple", "Iluminación y ventilación",  discrepancias_ensamble),
      normativa_urbanistica:   mergeSeccionConComparacion(r1.capa2?.normativa_urbanistica   || {}, r2.capa2?.normativa_urbanistica   || {}, "tabla", "parametro", "estado", "Normativa urbanística",      discrepancias_ensamble),
    },
  };
}

// ── Antepone el conteo real (determinístico) y limpia cualquier conteo que el modelo haya escrito igual ──
function fixResumenGeneral(text, altaCount, tecnicasCount) {
  const palabraAlta = altaCount === 1 ? "incumplimiento" : "incumplimientos";
  const palabraObs  = tecnicasCount === 1 ? "observación" : "observaciones";
  const intro = `El análisis identifica ${altaCount} ${palabraAlta} de criticidad ALTA y ${tecnicasCount} ${palabraObs} de criticidad MEDIA/BAJA.`;
  // Limpieza best-effort: si el modelo igual declaró un total (con dígito), lo saca para no duplicar/contradecir la intro.
  const limpio = (text || "")
    .replace(/\d+\s+incumplimientos?\s+de\s+criticidad\s+ALTA\.?/gi, "")
    .trim();
  return `${intro} ${limpio}`.trim();
}

// ── Sanea citas de artículos de DS 50/2015 que el modelo fabrica pese a la instrucción del prompt ──
function sanitizeDS50(value) {
  if (typeof value === "string") {
    return value.replace(/DS\s*50(?:\/2015)?\s*Art\.?\s*\d+\w*/gi, "DS 50/2015");
  }
  if (Array.isArray(value)) return value.map(sanitizeDS50);
  if (value && typeof value === "object") {
    const out = {};
    for (const k in value) out[k] = sanitizeDS50(value[k]);
    return out;
  }
  return value;
}

// ── Colab JSON → texto para el prompt ──────────────────────────────────────
function buildColabTexto(json) {
  if (!json) return "";
  if (json.paginas) {
    const lines = ["\nANÁLISIS SEMÁNTICO COLAB (estimaciones OpenCV + interpretación por recinto):\nNOTA: Las áreas son estimaciones geométricas desde píxeles. Para superficie_m2 en reconocimiento.recintos_por_nivel: usa la cota declarada en el plano si existe; si no hay cota visible, usa el área OpenCV del recinto correspondiente de esta lista (es medición real, no un invento). Para anchos, usa siempre la cota del plano. Las observaciones por recinto son alertas normativas del pipeline.\nIMPORTANTE — CONSOLIDACIÓN: más abajo verás bloques 'CANDIDATAS de Colab' — son observaciones normativas que Claude ya generó dentro del notebook de Colab, mirando solo la lámina y sin el contexto normativo completo que tú sí tienes (RAG + PRC de la comuna + expediente completo). Tu trabajo es VALIDARLAS con tu normativa completa (puedes corregir el artículo, la criticidad o el texto si tu fuente dice algo distinto) y fusionarlas en UNA sola observación final por hallazgo — nunca las dupliques como una observación aparte de la tuya sobre el mismo elemento.\nANTI-FABRICACIÓN — obligatorio: si una candidata de Colab cita un valor numérico específico (ej. \"ancho mínimo 1.6 m\", \"superficie mínima X m²\") como requisito normativo, NO lo aceptes como ALTA solo porque Colab lo afirma. Verifica ese número exacto contra el texto de OGUC/LGUC/PRC que tienes disponible en este prompt. Si no puedes confirmar ese valor en la normativa provista, la candidata queda en MEDIA con estado \"VERIFICAR\" y dilo explícitamente (ej. \"Colab cita un mínimo de X que no se confirma en la normativa disponible — revisar manualmente\"). Nunca repitas un valor numérico de Colab como si fuera un artículo verificado sin haberlo cruzado tú mismo contra el texto normativo real. ESTO INCLUYE el número de artículo/decreto citado, no solo el valor: si Colab cita \"DS 50/2015 Art. 8\" (o cualquier artículo específico de un decreto/circular) y ese artículo no aparece en el texto de OGUC/LGUC/PRC/DDU que tienes en este prompt, NO repitas esa cita como si estuviera verificada — nunca uses tu conocimiento general de normativa chilena para completar un artículo que no ves aquí. Trátalo como no confirmado y dilo explícitamente."];
    for (const p of json.paginas) {
      const sem = p.analisis_semantico || {};
      const tipoPlano = sem.tipo_plano || "desconocido";
      const nivel = sem.nivel || "";
      lines.push(`\nPágina ${p.pagina} — escala ${p.escala} — tipo: ${tipoPlano}${nivel ? ` — ${nivel}` : ""}:`);
      const recintos = sem.recintos || [];
      for (const r of recintos) {
        const area = r.area_estimada_m2 != null ? ` ~${r.area_estimada_m2} m²` : "";
        const ancho = r.ancho_estimado_m != null ? ` · ancho ~${r.ancho_estimado_m} m` : "";
        const cumple = r.cumple_oguc === false ? " [posible incumplimiento]" : r.cumple_oguc === true ? " [cumple]" : "";
        lines.push(`  - ${r.nombre} (${r.tipo})${area}${ancho}${cumple}`);
        if (r.observacion) lines.push(`    Obs: ${r.observacion}`);
      }
      const named = (p.mediciones_geometricas || []).filter(r => !r.nombre.startsWith("Espacio E"));
      for (const r of named) {
        const a = r.ancho_min_m != null ? ` · ancho estimado ${r.ancho_min_m} m` : "";
        const e = r.cumple_geo === false ? " [posible incumplimiento — verificar en plano]" : "";
        const idTag = r.id ? ` [${r.id}]` : "";
        lines.push(`  - ${r.nombre}${idTag} (${r.tipo}): ${r.area_m2} m²${a}${e}`);
      }
      for (const inc of (p.incumplimientos_geo || [])) {
        const u = inc.tipo === "area" ? "m²" : "m";
        lines.push(`  ALERTA OpenCV [${inc.tipo.toUpperCase()}] ${inc.recinto}: estimado ${inc.medido}${u} vs mínimo ${inc.minimo}${u} — ${inc.ref} — verificar contra cota en plano`);
      }
      const incOguc = sem.incumplimientos_oguc || [];
      if (incOguc.length > 0) {
        lines.push(`  CANDIDATAS de Colab (ya evaluadas por Claude en el notebook, revisar/validar — NO las repitas como hallazgo nuevo si ya están cubiertas aquí, consolídalas en una sola observación final citando el artículo correcto). IMPORTANTE: antes de aceptar una candidata, crúzala contra la tabla de mediciones geométricas del mismo recinto listada arriba en esta misma página (ancho/área ya medidos por OpenCV) — si la candidata contradice esa medición (ej. dice "no se especifica el ancho" cuando arriba ya hay un ancho_min_m para ese mismo recinto), prioriza el dato medido y corrige el texto de la observación, no repitas la contradicción:`);
        for (const o of incOguc) {
          const medida = o.medida_detectada ? ` (detectado: ${o.medida_detectada}${o.medida_requerida ? `, requerido: ${o.medida_requerida}` : ""})` : "";
          lines.push(`    [Colab-Claude ${o.gravedad || "?"}] ${o.recinto_afectado || "(sin recinto asociado)"}: ${o.descripcion || ""} — ${o.articulo || "sin artículo citado"}${medida}`);
        }
      }
      const semEls = p.analisis_semantico?.elementos_detectados;
      if (semEls) {
        const semParts = [];
        if (semEls.puertas)            semParts.push(`puertas=${semEls.puertas}`);
        if (semEls.ventanas)           semParts.push(`ventanas=${semEls.ventanas}`);
        if (semEls.escaleras)          semParts.push(`escaleras=${semEls.escaleras}`);
        if (semEls.salidas_emergencia) semParts.push(`salidas_emergencia=${semEls.salidas_emergencia}`);
        if (semParts.length > 0)
          lines.push(`  Análisis semántico Colab detectó: ${semParts.join(", ")}. Usa estos conteos en el campo 'cantidad' de vectorizacion.elementos.`);
      }
    }
    lines.push(`\nCÓDIGOS DE ELEMENTO: Cada recinto listado arriba tiene un código [E##] asignado por el análisis geométrico. Cuando hagas referencia a un recinto en tus observaciones e incumplimientos, cita su código, ej: "Baño Universal [E03] incumple...". Si un elemento no tiene nombre en el plano, refiérete solo por su código.`);
    const totalInc = json.resumen_global?.incumplimientos_geo_total ?? 0;
    if (totalInc > 0)
      lines.push(`\nHay ${totalInc} alertas OpenCV. Si la cota declarada en plano confirma el incumplimiento → ALTA. Si no hay cota o el valor parece fuera de escala → VERIFICAR.\n`);
    const rg = json.resumen_global || {};
    if (rg.puertas_detectadas != null && (rg.puertas_detectadas > 0 || rg.ventanas_detectadas > 0 || rg.escaleras_detectadas > 0))
      lines.push(`RESUMEN de elementos detectados en Colab (análisis semántico Claude Vision, consolidado): puertas=${rg.puertas_detectadas}, ventanas=${rg.ventanas_detectadas ?? 0}, escaleras=${rg.escaleras_detectadas ?? 0}, rampas=${rg.rampas_detectadas ?? 0}. Usa estos conteos en el campo 'cantidad' de vectorizacion.elementos.`);
    return lines.join("\n") + "\n";
  }
  if (json.tabla_cruzada) {
    const lines = [`\nMEDICIÓN GEOMÉTRICA REAL (Colab, escala ${json.escala || "no declarada"}):`];
    for (const r of json.tabla_cruzada) {
      if (!r.Nombre || r.Nombre.startsWith("Espacio")) continue;
      lines.push(`  - ${r.Nombre} (${r.Tipo || "—"}): ${r["Área m²"]} m²`);
    }
    return lines.join("\n") + "\n";
  }
  return "";
}

// ── Revisión gráfica de geometría — correcciones del arquitecto ────────────
const CORRECCIONES_VACIAS = {
  recintosEditados: {}, recintosEliminados: [], cortes: [], fusiones: [], areasExcluidas: [],
  elementosPuntualesEditados: {}, elementosPuntualesEliminados: [], elementosPuntualesNuevos: [],
  // motivo opcional por elemento eliminado (id -> texto), separado de elementosPuntualesEliminados
  // para no tocar los .includes(id) ya usados en varios lugares — ver eliminarElemento().
  motivosEliminacion: {},
};

// "campo" apunta a analisis_semantico[campo] (detección vía Claude Vision) para las categorías
// "linea"/"rectangulo" — Muro es la excepción: su geometría real viene de OpenCV (conectividad de
// trazos vectoriales, determinística, no adivinada por un LLM), en pag.muros_geo, un árbol
// totalmente distinto de analisis_semantico. Por eso "campo" no se usa para muro — ver el caso
// especial en getElementosPuntualesPorPagina/construirColabJsonCorregido.
// Puerta (2026-08-04): además de "puertas_detalle" (Claude Vision, campo de abajo), puede venir de
// pag.puertas_geo — un clasificador geométrico nuevo que reconoce el arco de giro directamente en
// los datos vectoriales (mismo origen que muros_geo), con la misma forma de datos que Muro
// (segmentos, no p1_relativo/p2_relativo) porque un arco puede venir en varios trazos. Cuando
// puertas_geo existe reemplaza a puertas_detalle para esa página — ver el caso especial en
// getElementosPuntualesPorPagina/construirColabJsonCorregido, mismo patrón que Muro.
const CATEGORIAS_ELEMENTO = [
  { id: "puerta",   campo: "puertas_detalle",   label: "Puerta",   prefijo: "P",  forma: "linea" },
  { id: "ventana",  campo: "ventanas_detalle",  label: "Ventana",  prefijo: "V",  forma: "linea" },
  { id: "escalera", campo: "escaleras_detalle", label: "Escalera", prefijo: "ES", forma: "rectangulo" },
  { id: "rampa",    campo: "rampas_detalle",    label: "Rampa",    prefijo: "R",  forma: "rectangulo" },
  { id: "muro",     campo: null,                label: "Muro",     prefijo: "MU", forma: "polilinea" },
];

// Centroide sintético (centro del bounding-box de todos los extremos) para un elemento
// representado como lista de segmentos (Muro, Puerta-geo) — necesario porque no tienen un único
// punto propio, pero el resto del pipeline (filtro "tiene posición", tabla de dudas) sigue
// asumiendo cx_relativo/cy_relativo. Espera segmentos ya normalizados a {p1:{x,y}, p2:{x,y}}
// (ver normalizarSegmentos).
function centroideDeSegmentos(segmentos, imagenWPx, imagenHPx) {
  const xs = segmentos.flatMap(s => [s.p1.x, s.p2.x]);
  const ys = segmentos.flatMap(s => [s.p1.y, s.p2.y]);
  return {
    cx_relativo: ((Math.min(...xs) + Math.max(...xs)) / 2) / (imagenWPx || 1),
    cy_relativo: ((Math.min(...ys) + Math.max(...ys)) / 2) / (imagenHPx || 1),
  };
}

// pag.muros_geo / pag.puertas_geo (JSON de Colab) traen p1/p2 como [x,y] (par de números, JSON no
// tiene tuplas) — el resto del portal (dibujo, hit-test, muros marcados a mano) trabaja con {x,y}.
// Normaliza una vez acá, al leer, para que downstream nunca tenga que soportar las 2 formas.
// Compartida entre Muro y Puerta-geo (2026-08-04) — mismo shape de datos para ambos.
function normalizarSegmentos(segmentos) {
  return (segmentos || []).map(s => ({
    p1: Array.isArray(s.p1) ? { x: s.p1[0], y: s.p1[1] } : s.p1,
    p2: Array.isArray(s.p2) ? { x: s.p2[0], y: s.p2[1] } : s.p2,
  }));
}

// Recintos de una página con todas las correcciones ya aplicadas (recintos base + ediciones +
// cortes + fusiones + resta de áreas excluidas). Usado tanto para la vista previa en vivo del
// canvas como, vía construirColabJsonCorregido, para el JSON final que se manda al análisis.
// Se identifica por entry_idx (no por el número de "pagina") porque una misma página física del
// PDF puede tener 2+ entradas en colabJson.paginas[] (crops distintos, ej. "pag2-1"/"pag2-2"),
// todas compartiendo el mismo número de pagina — entry_idx es el único campo realmente único.
function getMedicionesPorPagina(colabJson, correcciones, entryIdx) {
  const pag = (colabJson?.paginas || []).find(p => p.entry_idx === entryIdx);
  if (!pag) return [];
  let mg = (pag.mediciones_geometricas || []).filter(r => !correcciones.recintosEliminados.includes(r.id));
  mg = mg.map(r => correcciones.recintosEditados[r.id] ? { ...r, ...correcciones.recintosEditados[r.id] } : r);
  for (const fusion of correcciones.fusiones.filter(f => f.entryIdx === entryIdx)) {
    mg = mg.filter(r => !fusion.ids.slice(1).includes(r.id));
    mg = mg.map(r => r.id === fusion.resultado.id ? { ...r, ...fusion.resultado, _origen_fusion: fusion.ids } : r);
  }
  for (const corte of correcciones.cortes.filter(c => c.entryIdx === entryIdx)) {
    mg = mg.filter(r => r.id !== corte.origenId);
    mg.push(...corte.resultado.map(n => ({ ...n, pagina: pag.pagina, cumple_geo: true, sin_nombre_confirmar: false, _origen_corte: corte.origenId })));
  }
  const mpp = pag.mpp || 0;
  mg = mg.map(r => {
    const excl = correcciones.areasExcluidas.filter(a => a.recintoId === r.id && a.entryIdx === entryIdx);
    if (!excl.length) return r;
    const areaExcluidaTotal = excl.reduce((acc, a) => acc + a.bbox.w * a.bbox.h * mpp * mpp, 0);
    // 2026-08-17: redondeo agregado (bug real encontrado probando Excluir área en vivo) -- sin
    // esto el area quedaba con muchos decimales de punto flotante (ej. 57.63033425385861) en vez
    // de un valor limpio, mismo criterio de redondeo ya usado en Cortar/Fusionar.
    return { ...r, area_m2: Math.round(Math.max(0, (r.area_m2 || 0) - areaExcluidaTotal) * 100) / 100, _areas_excluidas: excl };
  });
  return mg;
}

// Elementos puntuales (puertas/ventanas/escaleras/rampas) de una página, con correcciones
// aplicadas — pre-tagueados por Colab (Parte A) + agregados manualmente por el arquitecto.
// Identificado por entry_idx, mismo motivo que getMedicionesPorPagina.
function getElementosPuntualesPorPagina(colabJson, correcciones, entryIdx) {
  const pag = (colabJson?.paginas || []).find(p => p.entry_idx === entryIdx);
  const sem = pag?.analisis_semantico || {};
  const out = [];
  for (const cat of CATEGORIAS_ELEMENTO) {
    // Muro: geométrico (OpenCV, pag.muros_geo), no semántico (Claude Vision) — origen distinto,
    // ver nota en CATEGORIAS_ELEMENTO. Se normalizan segmentos y se sintetiza un centroide.
    let arr;
    if (cat.id === "muro") {
      arr = (pag?.muros_geo || []).filter(m => !correcciones.elementosPuntualesEliminados.includes(m.id));
      arr = arr.map(m => correcciones.elementosPuntualesEditados[m.id] ? { ...m, ...correcciones.elementosPuntualesEditados[m.id] } : m);
      arr = arr.map(m => {
        const segmentos = normalizarSegmentos(m.segmentos);
        return { ...m, segmentos, ...centroideDeSegmentos(segmentos, pag?.imagen_w_px, pag?.imagen_h_px) };
      });
    } else if (cat.id === "puerta" && (pag?.puertas_geo || []).length) {
      // Puerta con geometría determinística (clasificador geométrico de arco, 2026-08-04) —
      // reemplaza a puertas_detalle (Claude Vision) cuando está disponible, mismo motivo que Muro:
      // la posición viene de los datos vectoriales del PDF, no de una estimación visual de un
      // modelo de visión (que resultó poco confiable, ver P04/V02 en el roadmap). _origenGeo marca
      // estos elementos para que construirColabJsonCorregido sepa reintegrarlos a pag.puertas_geo
      // y no a analisis_semantico.puertas_detalle.
      arr = (pag.puertas_geo || []).filter(p => !correcciones.elementosPuntualesEliminados.includes(p.id));
      arr = arr.map(p => correcciones.elementosPuntualesEditados[p.id] ? { ...p, ...correcciones.elementosPuntualesEditados[p.id] } : p);
      arr = arr.map(p => {
        const segmentos = normalizarSegmentos(p.segmentos);
        return { ...p, segmentos, _origenGeo: true, ...centroideDeSegmentos(segmentos, pag?.imagen_w_px, pag?.imagen_h_px) };
      });
    } else {
      arr = (sem[cat.campo] || []).filter(e => !e.id || !correcciones.elementosPuntualesEliminados.includes(e.id));
      arr = arr.map(e => (e.id && correcciones.elementosPuntualesEditados[e.id]) ? { ...e, ...correcciones.elementosPuntualesEditados[e.id] } : e);
    }
    out.push(...arr.map(e => ({ ...e, categoria: cat.id })));
  }
  out.push(...correcciones.elementosPuntualesNuevos.filter(n => n.entryIdx === entryIdx && !correcciones.elementosPuntualesEliminados.includes(n.id)));
  return out;
}

// Subconjunto de getElementosPuntualesPorPagina con posición real (cx_relativo/cy_relativo
// numéricos) — para dibujar en el canvas y contar "marcadas". JSON generados ANTES del cambio de
// notebook (Parte A) traen puertas_detalle sin posición; sin este filtro se dibujarían todos
// apilados en (0,0) y se contarían como "ya marcados" sin estarlo. getElementosPuntualesPorPagina
// (sin filtrar) se sigue usando para el JSON final exportado, para no perder la descripción en
// texto de esos elementos aunque no tengan posición.
function getElementosPuntualesConPosicion(colabJson, correcciones, entryIdx) {
  return getElementosPuntualesPorPagina(colabJson, correcciones, entryIdx)
    .filter(e => typeof e.cx_relativo === "number" && typeof e.cy_relativo === "number");
}

const PLURAL_ELEMENTOS = { puerta: "puertas", ventana: "ventanas", escalera: "escaleras", rampa: "rampas", muro: "muros" };

// Resumen "sistema detectó N, van M marcadas" por categoría — apoyo visual en LeyendaHerramientas,
// útil sobre todo para ventanas (recall históricamente ~0%, ver roadmap P1) donde casi siempre
// va a faltar marcar a mano incluso después de que el notebook exporte posición.
function calcularElementosDetectadosResumen(colabJson, correcciones, entryIdx) {
  const pag = colabJson?.paginas?.find(p => p.entry_idx === entryIdx);
  const conteos = pag?.analisis_semantico?.elementos_detectados || {};
  const elementos = getElementosPuntualesConPosicion(colabJson, correcciones, entryIdx);
  const out = {};
  for (const cat of CATEGORIAS_ELEMENTO) {
    out[cat.id] = { total: conteos[PLURAL_ELEMENTOS[cat.id]] ?? 0, marcadas: elementos.filter(e => e.categoria === cat.id).length };
  }
  return out;
}

// Corta un bbox en 2 mitades ortogonales según el eje dominante de la línea p1→p2 (simplificación
// deliberada v1 — no geometría de polígono real, suficiente para blobs fusionados yuxtapuestos).
function ejecutarCorte(bboxOrigen, p1, p2) {
  const dx = Math.abs(p2.x - p1.x), dy = Math.abs(p2.y - p1.y);
  const { x, y, w, h } = bboxOrigen;
  if (dx >= dy) {
    const cutX = Math.min(Math.max((p1.x + p2.x) / 2, x), x + w);
    return [{ x, y, w: cutX - x, h }, { x: cutX, y, w: x + w - cutX, h }];
  }
  const cutY = Math.min(Math.max((p1.y + p2.y) / 2, y), y + h);
  return [{ x, y, w, h: cutY - y }, { x, y: cutY, w, h: y + h - cutY }];
}

// Fusiona 2+ recintos en uno: bbox envolvente (simplificación, igual criterio que el corte) +
// suma de áreas reales (no área del envolvente, para no inflar con espacio vacío entre ambos).
function ejecutarFusion(recintos) {
  const x = Math.min(...recintos.map(r => r.bbox.x));
  const y = Math.min(...recintos.map(r => r.bbox.y));
  const xMax = Math.max(...recintos.map(r => r.bbox.x + r.bbox.w));
  const yMax = Math.max(...recintos.map(r => r.bbox.y + r.bbox.h));
  const area_m2 = recintos.reduce((acc, r) => acc + (r.area_m2 || 0), 0);
  return { bbox: { x, y, w: xMax - x, h: yMax - y }, area_m2 };
}

// Área de una zona excluida (mobiliario/WC/cota-eje colada en un recinto), en m² reales vía mpp.
function calcularAreaExcluida(bbox, mpp) {
  return bbox.w * bbox.h * mpp * mpp;
}

// Ancho real (m) y centroide (fracción 0-1) de un elemento puntual nuevo, desde una línea de 2 clics.
function calcularElementoDesdeLinea(p1, p2, mpp, imagenWPx, imagenHPx) {
  const ancho_m = Math.hypot(p2.x - p1.x, p2.y - p1.y) * mpp;
  const iw = imagenWPx || 1, ih = imagenHPx || 1;
  return {
    ancho_estimado_m: Math.round(ancho_m * 100) / 100,
    cx_relativo: ((p1.x + p2.x) / 2) / iw,
    cy_relativo: ((p1.y + p2.y) / 2) / ih,
    p1_relativo: { x: p1.x / iw, y: p1.y / ih },
    p2_relativo: { x: p2.x / iw, y: p2.y / ih },
  };
}

// Resuelve el segmento p1->p2 real de un elemento línea/rectángulo, en píxeles de imagen. Si el
// elemento trae p1_relativo/p2_relativo (geometría real, del notebook extendido o de un marcado
// a mano) los usa tal cual. Si no (JSON generado antes de este cambio, o elementos con solo
// centroide), sintetiza un segmento horizontal centrado en cx_relativo/cy_relativo usando
// ancho_estimado_m (0.9m por defecto) y marca sintetico:true — se dibuja punteado en vez de sólido,
// mismo principio de "incertidumbre transparente" que ya rige sin_nombre_confirmar.
function resolverPuntosElemento(e, imagenWPx, imagenHPx, mpp) {
  const iw = imagenWPx || 1, ih = imagenHPx || 1;
  if (e.p1_relativo && e.p2_relativo) {
    return {
      p1: { x: e.p1_relativo.x * iw, y: e.p1_relativo.y * ih },
      p2: { x: e.p2_relativo.x * iw, y: e.p2_relativo.y * ih },
      sintetico: false,
    };
  }
  const cx = (e.cx_relativo ?? 0) * iw, cy = (e.cy_relativo ?? 0) * ih;
  const anchoPx = mpp ? (e.ancho_estimado_m || 0.9) / mpp : 40;
  return { p1: { x: cx - anchoPx / 2, y: cy }, p2: { x: cx + anchoPx / 2, y: cy }, sintetico: true };
}

// Reintegra todas las correcciones del arquitecto en un clon del colabJson original — es lo que
// realmente se manda a analizar() en vez del JSON crudo de Colab. No toca las imágenes enviadas.
function construirColabJsonCorregido(colabJson, correcciones) {
  if (!colabJson) return colabJson;
  const clon = structuredClone(colabJson);
  for (const pag of clon.paginas || []) {
    pag.mediciones_geometricas = getMedicionesPorPagina(colabJson, correcciones, pag.entry_idx);
    if (!pag.analisis_semantico) pag.analisis_semantico = {};
    const elementos = getElementosPuntualesPorPagina(colabJson, correcciones, pag.entry_idx);
    const porCategoria = { puerta: [], ventana: [], escalera: [], rampa: [], muro: [] };
    for (const e of elementos) {
      const { categoria, ...resto } = e;
      (porCategoria[categoria] ||= []).push(resto);
    }
    // Muro es geométrico (pag.muros_geo), no semántico — mismo motivo que en
    // getElementosPuntualesPorPagina, ver nota en CATEGORIAS_ELEMENTO. Puerta se separa en 2:
    // las de origen geométrico (_origenGeo, del clasificador de arco) van a pag.puertas_geo; las
    // de Claude Vision o agregadas a mano por el arquitecto (2 clics) siguen en puertas_detalle.
    for (const cat of CATEGORIAS_ELEMENTO) {
      if (cat.id === "muro") {
        pag.muros_geo = porCategoria.muro;
      } else if (cat.id === "puerta") {
        pag.puertas_geo = porCategoria.puerta.filter(p => p._origenGeo).map(({ _origenGeo, ...p }) => p);
        pag.analisis_semantico.puertas_detalle = porCategoria.puerta.filter(p => !p._origenGeo);
      } else {
        pag.analisis_semantico[cat.campo] = porCategoria[cat.id];
      }
    }
  }
  return clon;
}

// JSON reducido y autocontenido por página, con solo lo necesario para rasterizar máscaras de
// entrenamiento (fine-tuning propio de MLSTRUCT-FP) — no todo colabJsonCorregido, para no acoplar
// el dataset al esquema completo del portal (analisis_semantico cambia seguido). dpi/proyecto son
// campos top-level de colabJsonCorregido, se repiten en cada página exportada para que el archivo
// sea autocontenido (el notebook de rasterización recibe un JSON por página, no el árbol completo).
function construirDatasetMurosPorPagina(colabJsonCorregido, murosDescartadosPorEntryIdx = {}) {
  const dpi = colabJsonCorregido?.dpi;
  const proyecto = colabJsonCorregido?.proyecto || "proyecto";
  return (colabJsonCorregido?.paginas || []).map(pag => ({
    proyecto, dpi,
    entry_idx: pag.entry_idx, pagina: pag.pagina, fname_tag: pag.fname_tag,
    imagen_w_px: pag.imagen_w_px, imagen_h_px: pag.imagen_h_px, mpp: pag.mpp,
    muros_geo: pag.muros_geo || [],
    // puertas_geo al mismo costo — deja el pipeline listo para reusarse en P04 (puertas) sin
    // tener que volver a tocar este exportador.
    puertas_geo: pag.puertas_geo || [],
    // Muros que el arquitecto descartó durante la revisión, con motivo si lo dejó — no son dato
    // positivo de entrenamiento (por eso van aparte, no en muros_geo), pero documentan patrones
    // reales de falso positivo del extractor geométrico (OpenCV), útiles para mejorarlo después.
    muros_descartados: murosDescartadosPorEntryIdx[pag.entry_idx] || [],
  }));
}

// Muros eliminados por el arquitecto, calculados contra colabJson ORIGINAL (sin corregir) —
// construirColabJsonCorregido ya los saca por completo de pag.muros_geo, así que hay que ir a
// buscarlos antes de ese filtro para no perder el registro de qué se descartó y por qué.
function construirMurosDescartadosPorPagina(colabJson, correcciones) {
  const out = {};
  for (const pag of colabJson?.paginas || []) {
    out[pag.entry_idx] = (pag.muros_geo || [])
      .filter(m => correcciones.elementosPuntualesEliminados.includes(m.id))
      .map(m => ({
        id: m.id, motivo: correcciones.motivosEliminacion?.[m.id] || null,
        segmentos: m.segmentos, ancho_linea_prom: m.ancho_linea_prom, largo_total_m: m.largo_total_m,
      }));
  }
  return out;
}

// Descarga, por cada página con PNG limpio disponible, el par (imagen sin overlay, geometría de
// muros ya corregida por el arquitecto) que alimenta el dataset de fine-tuning. Mismo patrón de
// descarga que descargarPngsRevisados (linea de abajo) para el PNG, y el patrón Blob de exportPDF
// para el JSON — sin inventar un mecanismo nuevo. colabPngs[i].objectUrl es el PNG crudo sin
// overlay (leerPngCrudo); pngsRevisadosPorPagina NO sirve acá, tiene anotaciones dibujadas encima.
function descargarDatasetMuros(colabJson, colabJsonCorregido, colabCorrecciones, colabPngs, tsFile) {
  const murosDescartadosPorEntryIdx = construirMurosDescartadosPorPagina(colabJson, colabCorrecciones);
  const paginasDataset = construirDatasetMurosPorPagina(colabJsonCorregido, murosDescartadosPorEntryIdx);
  for (const pagDs of paginasDataset) {
    const png = (colabPngs || []).find(p => p.entryIdx === pagDs.entry_idx);
    if (!png?.objectUrl) continue; // sin PNG limpio no hay par usable, se salta
    const etiqueta = pagDs.fname_tag || `pagina${pagDs.pagina}`;
    const base = `ArchiCheck_dataset_muros_${pagDs.proyecto}_${etiqueta}_${tsFile}`;

    const aImg = document.createElement("a");
    aImg.href = png.objectUrl;
    aImg.download = `${base}.png`;
    document.body.appendChild(aImg);
    aImg.click();
    aImg.remove();

    const blob = new Blob([JSON.stringify({ ...pagDs, png_origen: png.name }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const aJson = document.createElement("a");
    aJson.href = url;
    aJson.download = `${base}.json`;
    document.body.appendChild(aJson);
    aJson.click();
    aJson.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// ── Prompt Capa 1: levantamiento geométrico ────────────────────────────────
function buildPromptCapa1(tipo, comuna, archivos, preguntas = {}, colabData = null) {
  const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || tipo;
  const lista = archivos.map((f, i) => {
    const selCount = f.paginasSeleccionadas?.length ?? f.pdfImages?.length ?? 0;
    const tag = f.pdfImages?.length
      ? `${selCount} pág. de ${f.pdfImages[0].total} adjunta${selCount !== 1 ? "s" : ""} como imagen`
      : f.isImage ? "imagen adjunta" : "[formato no visual]";
    return `Archivo ${i + 1}: "${f.name}" (${f.tipoDoc || "sin clasificar"}) — ${tag}`;
  }).join("\n\n---\n\n");

  const comunaNombre = PRC_COMUNAS[comuna]?.meta?.nombre || (comuna || "comuna no especificada");
  const contextoLineas = [];
  if (preguntas.situacion) contextoLineas.push(`Expediente contiene: ${preguntas.situacion}`);
  if (preguntas.analizarSituacion) contextoLineas.push(`Analizar: ${preguntas.analizarSituacion}`);
  if (preguntas.niveles?.trim()) contextoLineas.push(`Niveles a priorizar: ${preguntas.niveles.trim()}`);
  const contextoTexto = contextoLineas.length ? `\nCONTEXTO:\n${contextoLineas.map(l => `- ${l}`).join("\n")}\n` : "";

  return `Eres revisor DOM de Chile. Analiza la calidad gráfica y el contenido geométrico de los planos adjuntos.

Proyecto: ${tipoLabel} — ${comunaNombre}
Archivos:
${lista}
${contextoTexto}
Tu tarea es el LEVANTAMIENTO GEOMÉTRICO: separación de capas gráficas, identificación de recintos y elementos arquitectónicos, evaluación de la vectorización, y descripción del modelo estructural por nivel.

Para cada planta identifica los recintos visibles con bbox como fracción de la imagen (bbox:[x1,y1,x2,y2] donde 0,0 es esquina superior-izquierda y 1,1 inferior-derecha). Omite bbox si no puedes estimarlo con confianza.
IMPORTANTE: NO inventes ni estimes superficies. Usa SOLO los valores de cotas escritos claramente en el plano (números con dimensión). Si no hay cota visible, pon superficie_m2:null. No copies la escala como si fuera un área.
Para pasillos y circulaciones: reporta SIEMPRE el ancho MÍNIMO declarado en el plano (la cota más estrecha de todo el recorrido), no el ancho en un tramo específico ni el promedio.
Si el análisis Colab incluye conteos de elementos (análisis semántico), úsalos para informar el campo 'cantidad' de vectorizacion.elementos (puertas, ventanas, escaleras, rampas).
${buildColabTexto(colabData)}
Responde SOLO con JSON puro sin markdown:
{"analisis_por_archivo":[{"archivo":"...","tipo_detectado":"...","estado":"OK|CON OBSERVACIONES|INCOMPLETO|NO LEGIBLE","elementos_ok":["..."],"recintos":[{"nombre":"...","uso":"...","superficie_m2":0,"pagina":1,"bbox":[0.1,0.1,0.5,0.5],"estado":"OK|OBSERVADO|INCUMPLE","observacion":"..."}]}],"capa1":{"separacion":{"capas":[{"nombre":"...","contenido":"...","paginas":"...","estado":"OK|OBSERVADO"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"reconocimiento":{"stats":{"recintos_total":0,"niveles":0},"recintos_por_nivel":[{"nivel":"...","recintos":[{"nombre":"...","uso":"...","superficie_m2":0,"estado":"OK|OBSERVADO|INCUMPLE"}]}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"vectorizacion":{"elementos":[{"tipo":"...","cantidad":0,"descripcion":"...","paginas":"...","estado":"OK|OBSERVADO"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"modelo":{"organizacion_funcional":[{"nivel":"...","uso":"...","area_m2":0,"conexion":"..."}],"accesos_evacuacion":[{"elemento":"...","estado":"OK|OBSERVADO|INCUMPLE","nota":"..."}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]}}}`;
}

// ── Prompt Capa 2: evaluación normativa ────────────────────────────────────
function buildPromptCapa2(tipo, comuna, archivos, preguntas = {}, colabData = null, capa1Context = null) {
  const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || tipo;
  const lista = archivos.map((f, i) => {
    const selCount = f.paginasSeleccionadas?.length ?? f.pdfImages?.length ?? 0;
    const tag = f.pdfImages?.length
      ? `${selCount} pág. seleccionada${selCount !== 1 ? "s" : ""} de ${f.pdfImages[0].total} adjunta${selCount !== 1 ? "s" : ""} como imagen`
      : f.isImage ? "imagen adjunta"
      : "[formato no visual — sin contenido extraíble]";
    return `Archivo ${i + 1}: "${f.name}" (${f.tipoDoc || "sin clasificar"}) — ${tag}`;
  }).join("\n\n---\n\n");

  // Resumen compacto de OGUC y LGUC — el sistema RAG inyecta los artículos completos más relevantes vía system prompt
  const ogucTexto = Object.entries(ogucArticulos.articulos)
    .map(([num, art]) => `Art. ${num} (${art.tema}): ${art.texto.replace(/\n+/g, " ").substring(0, 220).trimEnd()}…`)
    .join("\n");

  const lgucTexto = Object.entries(lgucArticulos.articulos)
    .map(([num, art]) => `Art. ${num} (${art.tema}): ${art.texto.replace(/\n+/g, " ").substring(0, 220).trimEnd()}…`)
    .join("\n");

  // Reglas de verificación nacional
  const reglasTexto = reglasNacionales.reglas
    .map(r => `- ${r.descripcion} (${r.referencia}): ${r.verificacion}`)
    .join("\n");

  // PRC de la comuna seleccionada
  const prcData = PRC_COMUNAS[comuna];
  const prcTexto = prcData
    ? `\nPRC ${prcData.meta.prc_nombre} — ${prcData.meta.prc_version}:\n` +
      Object.entries(prcData.normas)
        .filter(([id, z]) => !id.startsWith("_") && typeof z === "object" && z !== null)
        .map(([id, z]) => {
          const lineas = [`Zona ${id} (${z.nombre}): ${z.descripcion || ""}`];
          const cos = z.coef_ocupacion_suelo ?? z.coef_ocupacion_suelo_1p;
          if (cos)                            lineas.push(`  COS=${cos}`);
          if (z.coef_constructibilidad)       lineas.push(`  CC=${z.coef_constructibilidad}`);
          if (z.altura_maxima_m)              lineas.push(`  Altura máx=${z.altura_maxima_m}m`);
          if (z.altura_maxima_pisos)          lineas.push(`  Pisos máx=${z.altura_maxima_pisos}`);
          if (z.densidad_bruta_maxima_hab_ha) lineas.push(`  Densidad máx=${z.densidad_bruta_maxima_hab_ha} Hab/Há`);
          if (z.agrupamiento?.length)         lineas.push(`  Agrupamiento: ${z.agrupamiento.join(", ")}`);
          if (z.articulo)                     lineas.push(`  Referencia: ${z.articulo}`);
          if (z.notas)                        lineas.push(`  Notas: ${z.notas}`);
          return lineas.join("\n");
        }).join("\n")
    : "";

  const comunaNombre = prcData ? prcData.meta.nombre : (comuna || "comuna no especificada");

  const contextoLineas = [];
  if (preguntas.situacion) contextoLineas.push(`Expediente contiene: ${preguntas.situacion}`);
  if (preguntas.analizarSituacion) contextoLineas.push(`El arquitecto pide analizar: ${preguntas.analizarSituacion}`);
  if (preguntas.niveles?.trim()) contextoLineas.push(`Niveles a priorizar: ${preguntas.niveles.trim()}`);
  const contextoTexto = contextoLineas.length
    ? `\nCONTEXTO DECLARADO POR EL ARQUITECTO:\n${contextoLineas.map(l => `- ${l}`).join("\n")}\n`
    : "";

  return `Eres revisor DOM de Chile experto en LGUC, OGUC, circulares DDU del MINVU, normativas NCh y Plan Regulador de ${comunaNombre}.

NORMATIVA NACIONAL VIGENTE — OGUC (última versión ${ogucArticulos.ultima_version}):
${ogucTexto}

NORMATIVA NACIONAL VIGENTE — LGUC (última versión ${lgucArticulos.ultima_version}):
${lgucTexto}

REGLAS DE VERIFICACIÓN OBLIGATORIAS:
${reglasTexto}
${prcTexto}
Proyecto: ${tipoLabel} — ${comunaNombre}
Archivos:
${lista}

CIRCULARES DDU VIGENTES (División de Desarrollo Urbano, MINVU):
- DDU 351: Accesibilidad universal — rampas, ascensores, circulaciones accesibles (DS 50/2015)
- DDU 447: Aportes al espacio público y tramitación de permisos (Ley 20.958)
- DDU 172: Plazos de las Direcciones de Obras Municipales (Ley 19.880 art. 24)
- DDU 176: Aplicación art. 1.4.7 OGUC — certificados e informes previos
- DDU 186: Aplicación arts. 2.1.18 y 2.1.43 OGUC — urbanismo y construcción
- DDU 200: Subdivisión predial — procedimiento simplificado (Ley 20.234)
- DDU 201: Permisos de edificación simplificados para viviendas (Ley 20.251)
- DDU 157: Registro Nacional de Revisores Independientes de Obras (Ley 20.071)
- DDU 912: Aplicación art. 5.1.2 N°2 OGUC — tipo y calidad de edificación
- DDU 1022: Aplicación arts. 1.1.2, 5.1.14 y 5.1.17 OGUC — tipos de construcción

IMPORTANTE — DS 50/2015: este decreto NO está cargado como texto en este sistema (solo se referencia dentro de OGUC Art. 4.1.7, que sí tienes completo). NUNCA cites un número de artículo específico de "DS 50/2015" (ej. "Art. 6", "Art. 7", "Art. 8", "Art. 22") — no tienes ese texto para verificarlo, y aunque "sepas" de tu entrenamiento que existe, no puedes confirmar el número exacto ni su contenido actual. Si el requisito es real (ancho de puerta accesible, círculo de giro, ancho de ruta accesible), cita el artículo real de OGUC Art. 4.1.7 que sí tienes en este prompt, o menciona "DS 50/2015" sin número de artículo. Esta regla aplica también a candidatas de Colab que citen un artículo de DS 50/2015 — corrígelas a OGUC Art. 4.1.7 o elimina el número de artículo.

Usa la normativa anterior como base de tu análisis. Cita el artículo exacto de OGUC, LGUC o la circular DDU correspondiente cuando detectes cumplimiento o incumplimiento.
${contextoTexto}Analiza solo los archivos adjuntos. No penalices por documentos no subidos.
${(() => {
    if (!capa1Context?.capa1) return "";
    const obs = [];
    for (const [sec, data] of Object.entries(capa1Context.capa1)) {
      for (const ob of (data?.observaciones || [])) {
        obs.push(`[${sec}] ${ob.descripcion} — ${ob.articulo || ""} — ${ob.criticidad || ""}`);
      }
    }
    if (!obs.length) return "";
    return `\nOBSERVACIONES DEL LEVANTAMIENTO GEOMÉTRICO (Fase 1) — toma en cuenta estos issues al evaluar:\n${obs.map(o => `• ${o}`).join("\n")}\n`;
  })()}

INSTRUCCIONES OBLIGATORIAS DE COMPLETITUD:
1. EXHAUSTIVIDAD: Actúa como revisor DOM oficial. Examina sistemáticamente TODAS estas áreas normativas y genera observaciones para cada incumplimiento o punto que requiera verificación:
   • Superficies mínimas por tipo de recinto (OGUC Art. 4.1.1, 4.1.7)
   • Alturas libres interiores en cortes (OGUC Art. 4.2.6)
   • Anchos de pasillos, rampas y accesos (OGUC Art. 4.2.5) y de escaleras (OGUC Art. 4.2.10, ver instrucción 3c más abajo) — mide anchos SOLO desde planta o detalle acotado; NO estimes anchos desde láminas de elevación o corte (la elevación muestra profundidad, no ancho en planta)
   • Carga de ocupación calculada por recinto y nivel (OGUC Art. 4.2.4)
   • Salidas de emergencia: cantidad y ancho según carga (OGUC Art. 4.2.4, 4.2.5)
   • Resistencia al fuego de elementos estructurales (OGUC Art. 4.3.3); para determinar la clase (a/b/c/d) usa OGUC Art. 4.3.4 Tabla 1 cruzando destino × número de pisos: restaurante 250–500 m² en 2 pisos = clase 'b', en 1 piso = clase 'c'
   • Iluminación y ventilación natural por recinto — ratio 1/6 (OGUC Art. 4.1.2, 4.5.7)
   • Ductos de ventilación mecánica para baños y cocinas sin ventana (OGUC Art. 4.1.3)
   • Accesibilidad universal: rampa, baño accesible, estacionamiento, ruta (OGUC Art. 4.1.7, DDU 351)
   • Pasamanos en escaleras (OGUC Art. 4.2.7)
   • Constructibilidad, COS, altura máxima, rasantes (OGUC Art. 2.6.1, PRC comuna)
   • Distanciamientos y adosamiento a deslindes (OGUC Art. 2.6.2, 2.6.3, PRC comuna)
   • Uso de suelo y cambio de destino si aplica (LGUC Art. 116, Art. 57-59, PRC comuna)
   • Dotación de estacionamientos (OGUC Art. 2.4.1)
   • Protección patrimonial si aplica (LGUC Art. 60)
   • Documentación faltante: CIP, cuadro superficies, cuadro iluminación, estudio carga ocupación, especificaciones RF (DDU 390)
2. Las observaciones de cada sección deben ser DISTINTAS y específicas de esa etapa. No repitas el mismo hallazgo en múltiples secciones.
2b. Si el contexto incluye "CANDIDATAS de Colab" para un recinto/elemento, no generes una observación aparte sobre el mismo hallazgo — consolídala: usa tu normativa completa para confirmar o corregir el artículo y la criticidad, y entrega una única observación final.
3. iluminacion_ventilacion.tabla: incluye una fila por cada recinto habitable visible. Los PNG marcados "ANOTADO" traen las ventanas (y puertas/muros/escaleras/rampas) ya revisadas o agregadas a mano por el arquitecto, dibujadas directamente sobre el plano con un id visible (ej. "V-A1") — úsalas: para cada ventana anotada, identificá visualmente en qué recinto está dibujada (por proximidad al muro y al nombre del recinto en el plano) y usá su ancho marcado (la línea entre los 2 puntos de la marca) junto con una altura estándar de ventana (~1.20 m si no hay cota de altura visible) para estimar area_ventana_m2 de ese recinto. Si aun así no podés determinar con confianza a qué recinto corresponde una ventana anotada o no hay ninguna marca visible para un recinto, usa area_ventana_m2:null y cumple:"VERIFICAR" — no inventes una asociación que no podés sustentar visualmente.
3b. Pendiente de rampas (OGUC Art. 4.1.7 N°2): la pendiente máxima NO es un valor fijo de 8%. Usa la fórmula real: i% = 12.8 - 0.5333*L, donde L es el largo de desarrollo de la rampa en metros (válida entre L=1.5m→12% y L=9m→8%). Calcula el máximo permitido para el largo real de la rampa antes de decidir si incumple, y cita el margen exacto en la observación (ej. "supera en 0.18 puntos porcentuales el máximo de 10.40% para un desarrollo de 4.5m" — no "supera el 8%").
3c. Ancho de escaleras (OGUC Art. 4.2.10): NO cites Art. 4.2.2 para esto — ese artículo es sobre autorización de cambio de destino, no tiene relación con escaleras. El ancho mínimo NO es un valor fijo de 1.20m: es una tabla por carga de ocupación servida por la escalera — ≤50 personas → 1.10m; 51-100 → 1.20m; 101-150 → 1.30m; 151-200 → 1.40m; 201-250 → 1.50m; sobre 250 → se requieren 2 escaleras. Calcula o estima la carga de ocupación del área servida antes de fijar el mínimo aplicable; si no puedes calcularla, usa el piso de la tabla (1.10m), no 1.20m por defecto. Cita siempre Art. 4.2.10, nunca 4.2.2.
3d. Mismo criterio de la instrucción 3 (marcas ANOTADAS), extendido a puertas/escaleras/rampas: los PNG "ANOTADO" también traen puertas, escaleras y rampas ya revisadas o agregadas a mano, cada una con su id visible (ej. "P-A1", "ES-A1", "R-A1"). Para cada una, identificá visualmente en qué recinto o entre qué 2 recintos está dibujada (por proximidad al muro, al vano, y a los nombres de recinto impresos en el plano) y usá su ancho/largo marcado (la línea entre los 2 puntos de la marca) como medición real cuando no haya cota explícita en el plano: (a) puertas — ancho para los chequeos de accesos/salidas de emergencia (Art. 4.2.4, 4.2.5); (b) escaleras — ancho y a qué tramo/nivel conecta, como insumo de la instrucción 3c; (c) rampas — largo de desarrollo aproximado (la línea marcada es el eje de la rampa en planta) y a qué recintos conecta, como insumo de la instrucción 3b. Si no podés determinar con confianza el recinto/tramo de un elemento anotado, tratalo como "VERIFICAR" en la observación correspondiente en vez de inventar la asociación.
4b. circulaciones.tabla — ancho_minimo_m: usa SIEMPRE el mínimo MÁS RESTRICTIVO de todos los artículos aplicables. Si citas DS 50/2015 Art. 22 o Art. 23, el mínimo es 1.50m (no 1.20m). Si citas OGUC Art. 4.2.4 con carga >50 personas, el mínimo puede superar 1.20m según fórmula. Para escaleras, aplica la tabla de la instrucción 3c (no un valor fijo). El campo ancho_minimo_m debe coincidir con el valor que determina el resultado de 'cumple'.
4. normativa_urbanistica.tabla: incluye una fila por cada parámetro del PRC y OGUC aplicable (rasante(s), constructibilidad, COS, altura máxima, uso de suelo, distancias a deslindes, adosamiento, línea de edificación). Usa estado:"VERIFICAR" si no hay dato visible en los planos.

Para cada planta de arquitectura identifica los recintos visibles con bbox como fraccion de la imagen (bbox:[x1,y1,x2,y2] donde 0,0 es esquina superior-izquierda y 1,1 inferior-derecha). Si no puedes estimar coordenadas confiables para un recinto, omite bbox.
${buildColabTexto(colabData)}
CRITERIOS DE CRITICIDAD — aplicar en todas las observaciones:
• ALTA: Impide la aprobación DOM o representa riesgo de seguridad. Requiere corrección de diseño antes de presentar expediente. Ej: segunda salida de emergencia ausente, baño universal fuera de norma confirmado por cota, cambio de destino no tramitado formalmente cuando el expediente lo declara explícitamente, pendiente de rampa excede máximo declarado en plano.
• MEDIA: Debe resolverse pero no impide avanzar. Se corrige con documentación adicional o ajustes menores. Ej: falta cuadro de iluminación, dimensiones no acotadas, pasamanos no graficados.
• BAJA: Detalle de presentación o recomendación menor. No afecta la aprobación. Ej: escala poco legible, leyenda incompleta.

REGLA CLAVE — falta de documentación NO equivale a incumplimiento confirmado: si un parámetro no se puede verificar porque falta un dato o documento en el expediente (zona PRC no declarada, CIP ausente, planos de evacuación no incluidos, cuadro de superficies ilegible, etc.), clasifícalo SIEMPRE como MEDIA con estado:"VERIFICAR" — nunca como ALTA, aunque esa falta de información sea relevante para el proyecto. Reserva ALTA exclusivamente para incumplimientos CONFIRMADOS por una cota, dimensión o dato explícito visible en el plano (ej. pendiente de rampa declarada en 13.58%, ancho de pasillo acotado en 1.22m). La única excepción es un trámite legal que el propio expediente declara explícitamente como no realizado (ej. "cambio de destino: solicitado" ausente en carátula) — eso sí puede ser ALTA, porque es un hecho declarado, no una ausencia de información.

CRITERIOS PARA estado_global:
• APROBABLE: Todos los parámetros verificados cumplen o las observaciones son menores. Sin incumplimientos ALTA.
• OBSERVADO: Existen incumplimientos corregibles. El proyecto PUEDE aprobarse con correcciones.
• RECHAZABLE: Incumplimientos irresolubles sin rediseño mayor — incompatibilidad de uso con zonificación PRC, parámetros absolutos excedidos. NUNCA usar por falta de documentación o permisos pendientes.

VALORES NUMÉRICOS — PRIORIDAD DE FUENTE: Para todo valor numérico (pendientes %, dimensiones en m, áreas en m², alturas): lee DIRECTAMENTE de las cotas acotadas en la imagen. El análisis semántico Colab puede tener errores de transcripción. Si el valor Colab contradice lo que ves claramente en el plano, usa el valor del plano. Si hay ambigüedad y no puedes confirmarlo desde la imagen, usa estado:"VERIFICAR" y describe la discrepancia en la observación (ej: "Colab reporta X pero imagen parece mostrar Y — verificar en plano original").

tabla_observaciones: ES LA ÚNICA FUENTE DE VERDAD DEL INFORME — consolida aquí TODAS las observaciones (ALTA, MEDIA y BAJA) del análisis completo, agrupadas por tema. OBLIGATORIO: cada "descripcion" debe empezar indicando el nivel del proyecto (ej. "Nivel 1", "Nivel 2", o "Ambos niveles" si aplica a todo el edificio) y la página del PDF de la que se extrae el dato (ej. "página 2 de 4"), antes del detalle del hallazgo — formato: "Nivel X · página Y del PDF: [detalle]". Si el hallazgo es normativa urbanística general sin nivel específico, indica solo la página. Si el mismo hallazgo aplica a varias secciones (por ejemplo aparece tanto en capa1 como en capa2), inclúyelo UNA SOLA VEZ aquí — nunca lo dupliques. Temas disponibles: "Accesibilidad Universal", "Evacuación y Seguridad", "Ventilación e Iluminación", "Normativa Urbanística", "Documentación Faltante", "Geometría y Presentación". Incluye solo temas con observaciones. Cada observación de tabla_observaciones debe incluir "etapas": un array con una o más de estas etiquetas EXACTAS (las secciones donde ese hallazgo es relevante o fue detectado): "Separación", "Reconocimiento", "Vectorización", "Modelo", "Recintos", "Circulaciones", "Iluminación", "Urbanística". Usa varias etiquetas cuando el hallazgo involucre a más de una sección.

resumen_general — PROHIBIDO declarar el total de incumplimientos ALTA, en dígito o en palabra: el sistema antepone automáticamente la frase con el conteo exacto antes de tu párrafo, así que NUNCA escribas "N incumplimientos", "N incumplimientos de criticidad ALTA", "estos N hallazgos", "estos tres/cuatro/cinco hallazgos son los únicos incumplimientos ALTA" ni ninguna variante que declare cuántos hay en total (ni con dígito, ni con la palabra en español) — cualquier conteo que escribas tú se vuelve redundante con el que ya antepone el sistema, y si difiere, confunde al lector. Tu párrafo empieza directo describiendo los temas (ej. "Los incumplimientos ALTA corresponden a accesibilidad universal — rampa, baño universal y puertas de baños de clientes — y a evacuación del Nivel 2"), sin lista numerada "(1)(2)(3)" ni frase de cierre que intente sumar cuántos son. Puedes nombrar y describir cada hallazgo relevante, solo no declares el total.

Responde SOLO con JSON puro, sin markdown, sin texto previo. Produce ÚNICAMENTE la evaluación normativa — capa2 va PRIMERO en el JSON para protegerla de truncaciones.
{"capa2":{"recintos_superficies":{"tabla":[{"recinto":"...","uso":"...","sup_real_m2":0,"sup_minima_m2":0,"cumple":"SI|NO|VERIFICAR","articulo":"..."}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"circulaciones":{"tabla":[{"elemento":"...","ancho_real_m":0,"ancho_minimo_m":0,"articulo":"...","cumple":"SI|NO|VERIFICAR"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"iluminacion_ventilacion":{"tabla":[{"recinto":"...","area_ventana_m2":0,"area_recinto_m2":0,"ratio_requerido":"1/6","cumple":"SI|NO|VERIFICAR"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"normativa_urbanistica":{"tabla":[{"parametro":"...","referencia":"...","valor_proyecto":"...","estado":"OK|OBSERVADO|INCUMPLE"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]}},"resumen_general":"...","estado_global":"APROBABLE|OBSERVADO|RECHAZABLE","tabla_observaciones":[{"tema":"Accesibilidad Universal|Evacuación y Seguridad|Ventilación e Iluminación|Normativa Urbanística|Documentación Faltante|Geometría y Presentación","observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"...","etapas":["Separación|Reconocimiento|Vectorización|Modelo|Recintos|Circulaciones|Iluminación|Urbanística"]}]}],"alertas_especiales":["..."],"pasos_siguientes":["..."]}`;
}

// ── PDF → thumbnails (todas las páginas, baja res) + full-res bajo demanda ──
const MAX_PDF_PAGES = 15;

async function pdfPagesToBase64(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const images = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      // thumb a escala baja para UI; full-res se genera en analizar()
      const vThumb = page.getViewport({ scale: 0.35 });
      const cThumb = document.createElement("canvas");
      cThumb.width = vThumb.width; cThumb.height = vThumb.height;
      await page.render({ canvasContext: cThumb.getContext("2d"), viewport: vThumb }).promise;
      images.push({
        thumb: cThumb.toDataURL("image/jpeg", 0.75),
        page: i,
        total: pdf.numPages,
      });
    }
    return images;
  } catch {
    return [];
  }
}

async function renderPdfPagesFullRes(file, pageNumbers) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images = [];
    for (const i of pageNumbers) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push({ data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], page: i, total: pdf.numPages });
    }
    return images;
  } catch {
    return [];
  }
}

// ── Imagen a base64 ────────────────────────────────────────────────────────
async function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Comprimir imagen a JPEG (max 2000px, evita límite 5MB Anthropic) ────────
async function compressImage(file, maxPx = 2000, quality = 0.80) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Helpers de color ───────────────────────────────────────────────────────
const critStyle = (c) => ({
  ALTA:  { color: "#C0392B", background: "rgba(192,57,43,0.08)",  border: "1px solid rgba(192,57,43,0.25)" },
  MEDIA: { color: "#D68910", background: "rgba(214,137,16,0.08)", border: "1px solid rgba(214,137,16,0.25)" },
  BAJA:  { color: "#1E8449", background: "rgba(30,132,73,0.08)",  border: "1px solid rgba(30,132,73,0.25)" },
})[c] || {};

const estadoDocStyle = (e) => ({
  "OK":                { color: "#1E8449", background: "rgba(30,132,73,0.08)",   border: "1px solid rgba(30,132,73,0.25)" },
  "CON OBSERVACIONES": { color: "#D68910", background: "rgba(214,137,16,0.08)",  border: "1px solid rgba(214,137,16,0.25)" },
  "INCOMPLETO":        { color: "#C0392B", background: "rgba(192,57,43,0.08)",   border: "1px solid rgba(192,57,43,0.25)" },
  "NO LEGIBLE":        { color: "#6B7A99", background: "rgba(107,122,153,0.08)", border: "1px solid rgba(107,122,153,0.25)" },
})[e] || {};

const globalStyle = (e) => ({
  "APROBABLE":  { color: "#1E8449", background: "rgba(30,132,73,0.10)",   border: "1px solid rgba(30,132,73,0.35)" },
  "OBSERVADO":  { color: "#D68910", background: "rgba(214,137,16,0.10)",  border: "1px solid rgba(214,137,16,0.35)" },
  "RECHAZABLE": { color: "#C0392B", background: "rgba(192,57,43,0.10)",   border: "1px solid rgba(192,57,43,0.35)" },
})[e] || {};

// ── Canvas overlay de recintos ─────────────────────────────────────────────
function CanvasOverlay({ src, recintos, pagina }) {
  const ref = useRef();
  const COLORES = { OK: "#1E8449", OBSERVADO: "#D68910", INCUMPLE: "#C0392B" };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const pagRecintos = recintos.filter(r => r.pagina === pagina && Array.isArray(r.bbox) && r.bbox.length === 4);
      for (const r of pagRecintos) {
        const [x1, y1, x2, y2] = r.bbox;
        const px = x1 * img.width,  py = y1 * img.height;
        const pw = (x2 - x1) * img.width, ph = (y2 - y1) * img.height;
        const col = COLORES[r.estado] || COLORES.OBSERVADO;
        ctx.fillStyle   = col + "28";
        ctx.strokeStyle = col;
        ctx.lineWidth   = Math.max(1.5, img.width * 0.003);
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeRect(px, py, pw, ph);
        const fs = Math.max(10, img.width * 0.018);
        ctx.font         = `bold ${fs}px sans-serif`;
        ctx.fillStyle    = col;
        ctx.fillText(r.nombre, px + 4, py + fs + 2);
        if (r.superficie_m2) {
          ctx.font      = `${fs * 0.8}px sans-serif`;
          ctx.fillText(`${r.superficie_m2} m²`, px + 4, py + fs * 2 + 4);
        }
      }
    };
    img.src = src;
  }, [src, recintos, pagina]);

  return (
    <canvas ref={ref}
      style={{ width: "100%", display: "block", borderRadius: 6, border: "1px solid #D1D9EE" }} />
  );
}

// ── Revisión gráfica de geometría — canvas interactivo ──────────────────────
const COLOR_RECINTO = "#1B3A8A";
const COLOR_RECINTO_SEL = "#2952A3";
const COLOR_EXCLUIDA = "#C0392B";
const COLORES_ELEMENTO_PUNTUAL = { puerta: "#1E8449", ventana: "#2952A3", escalera: "#D68910", rampa: "#8E44AD", muro: "#5D4037" };

// Dibuja recintos + elementos puntuales + vista previa de herramienta sobre un canvas ya
// dimensionado a la imagen real. Compartida entre el canvas interactivo (RevisionGeometricaCanvas)
// y la generación del PNG final descargable (dibujarPngRevisado) — misma lógica, sin duplicar.
function dibujarOverlayEnCanvas(ctx, img, {
  mediciones = [], elementosPuntuales = [], imagenWPx, imagenHPx,
  selectedId = null, preview = null, mpp = 0,
} = {}) {
  ctx.clearRect(0, 0, img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const lw = Math.max(1.5, img.width * 0.0025);
  const iw = imagenWPx || img.width, ih = imagenHPx || img.height;

  // Recintos: no se dibujan (ni rectángulo ni relleno ni nombre/área), a pedido explícito del
  // usuario (2026-08-02) — "necesito ver solamente las marcas de los elementos". `mediciones`
  // se sigue recibiendo y usando para hit-test (seleccionar/editar nombre-tipo-área al hacer
  // clic sigue funcionando, ver hitTestRecinto), simplemente no hay feedback visual en el canvas.

  for (const e of elementosPuntuales) {
    const col = COLORES_ELEMENTO_PUNTUAL[e.categoria] || "#333";
    const isSel = e.id === selectedId;
    const cat = CATEGORIAS_ELEMENTO.find(c => c.id === e.categoria);
    const forma = cat?.forma;
    const fs = Math.max(10, img.width * 0.012);
    // Etiqueta = id real del elemento (ej. "P01", "MU-A1"), no solo la letra de categoría — a
    // pedido explícito del usuario (2026-08-02), para poder distinguir cada elemento individual
    // al revisar el plano (antes todas las puertas mostraban la misma "P", indistinguibles).
    const label = e.id || cat?.prefijo || "?";

    // Polilínea (N segmentos, no 2 puntos): Muro siempre, y Puerta cuando viene del clasificador
    // geométrico de arco (2026-08-04, e._origenGeo) — se despacha por la FORMA del dato
    // (Array.isArray(e.segmentos)), no por categoría, porque ambas comparten el mismo shape. Las
    // otras 3 formas (y puerta/ventana cuando NO es de origen geométrico) se resuelven vía
    // resolverPuntosElemento.
    if (Array.isArray(e.segmentos) && e.segmentos.length >= 1) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = isSel ? lw * 2.5 : lw * 1.5;
      ctx.beginPath();
      // Cada segmento se traza de forma independiente (no se asume que encadenan en un solo
      // camino — un muro real de Colab puede ramificarse en una esquina en T o un cruce).
      for (const s of e.segmentos) { ctx.moveTo(s.p1.x, s.p1.y); ctx.lineTo(s.p2.x, s.p2.y); }
      ctx.stroke();
      ctx.restore();
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = col;
      const p0 = e.segmentos[0].p1;
      ctx.fillText(label, p0.x + 4, p0.y - 4);
      continue;
    }

    // Puerta/ventana/escalera/rampa detectadas por Colab: la geometría p1_relativo/p2_relativo
    // que devuelve Claude Vision resultó poco confiable en la primera corrida real (posiciones y
    // orientación alejadas de la real, ver roadmap 2026-08-02) — para estas se vuelve al punto
    // simple (centroide), igual que antes de este cambio. Solo lo que el arquitecto marca a mano
    // (e._nuevo) usa la línea/rectángulo real, porque ahí la geometría sí es exacta (viene de sus
    // propios clics).
    if (!e._nuevo) {
      const cx = (e.cx_relativo ?? 0) * iw, cy = (e.cy_relativo ?? 0) * ih;
      const rad = isSel ? 9 : 6;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = col;
      ctx.fillText(label, cx + rad + 3, cy + fs / 3);
      continue;
    }

    const { p1, p2, sintetico } = resolverPuntosElemento(e, iw, ih, mpp);
    ctx.save();
    if (sintetico) ctx.setLineDash([5, 3]);
    ctx.font = `bold ${fs}px sans-serif`;
    ctx.fillStyle = col;

    if (forma === "rectangulo") {
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x) || 20, h = Math.abs(p2.y - p1.y) || 20;
      ctx.strokeStyle = col;
      ctx.lineWidth = isSel ? lw * 2 : lw;
      ctx.fillStyle = col + "22";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = col;
      ctx.fillText(label, x + 4, y + fs + 2);
    } else {
      // "linea" (puerta/ventana) — segmento real p1->p2, punteado si es una aproximación sintética.
      ctx.strokeStyle = col;
      ctx.lineWidth = isSel ? lw * 2.5 : lw * 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.fillText(label, (p1.x + p2.x) / 2 + 4, (p1.y + p2.y) / 2 - 4);
    }
    ctx.restore();
  }

  if (preview?.tipo === "polilinea" && preview.puntos?.length) {
    const { puntos, cursor } = preview;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#D68910";
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(puntos[0].x, puntos[0].y);
    for (let i = 1; i < puntos.length; i++) ctx.lineTo(puntos[i].x, puntos[i].y);
    if (cursor) ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    ctx.restore();
    if (mpp && cursor) {
      let largo = 0;
      for (let i = 1; i < puntos.length; i++) largo += Math.hypot(puntos[i].x - puntos[i - 1].x, puntos[i].y - puntos[i - 1].y);
      largo += Math.hypot(cursor.x - puntos[puntos.length - 1].x, cursor.y - puntos[puntos.length - 1].y);
      const fs = Math.max(12, img.width * 0.016);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = "#D68910";
      ctx.fillText(`${(largo * mpp).toFixed(2)} m`, cursor.x + 8, cursor.y - 8);
    }
  }

  if (preview?.p1 && preview?.p2) {
    const { p1, p2, tipo } = preview;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "#D68910";
    ctx.lineWidth = lw;
    let label = null;
    if (tipo === "rect") {
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      ctx.fillStyle = "#D6891028";
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      if (mpp) label = `${(w * h * mpp * mpp).toFixed(2)} m²`;
    } else {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      if (mpp) label = `${(Math.hypot(p2.x - p1.x, p2.y - p1.y) * mpp).toFixed(2)} m`;
    }
    ctx.restore();
    if (label) {
      const fs = Math.max(12, img.width * 0.016);
      ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = "#D68910";
      ctx.fillText(label, p2.x + 8, p2.y - 8);
    }
  }
}

// Rasteriza un PNG corregido fuera de pantalla (nunca insertado en el DOM visible) usando la
// misma dibujarOverlayEnCanvas del canvas interactivo, sin ningún estado de herramienta en curso.
// Se usa al confirmar la revisión, para generar el archivo descargable junto al informe PDF.
function dibujarPngRevisado(png, mediciones, elementosPuntuales, imagenWPx, imagenHPx, mpp) {
  return new Promise((resolve, reject) => {
    if (!png?.objectUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      dibujarOverlayEnCanvas(ctx, img, { mediciones, elementosPuntuales, imagenWPx, imagenHPx, mpp });
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = png.objectUrl;
  });
}

// Descarga cada PNG corregido como archivo separado (no embebido en el PDF, a pedido explícito
// del usuario) — un <a download> temporal por página, mismo timestamp que el PDF de la misma
// exportación. Nota: los navegadores pueden pedir confirmación en descargas múltiples automáticas
// (comportamiento estándar anti-spam, no un bug a resolver acá).
function descargarPngsRevisados(pngsRevisadosPorPagina, tsFile) {
  for (const entry of Object.values(pngsRevisadosPorPagina || {})) {
    if (!entry?.dataUrl) continue;
    const etiqueta = entry.fnameTag || `pagina${entry.pagina}`;
    const a = document.createElement("a");
    a.href = entry.dataUrl;
    a.download = `ArchiCheck_plano_revisado_${etiqueta}_${tsFile}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function hitTestRecinto(mediciones, x, y) {
  let best = null, bestArea = Infinity;
  for (const r of mediciones) {
    if (!r.bbox) continue;
    const { x: rx, y: ry, w, h } = r.bbox;
    if (x >= rx && x <= rx + w && y >= ry && y <= ry + h) {
      const area = w * h;
      if (area < bestArea) { bestArea = area; best = r; }
    }
  }
  return best;
}

function distanciaPuntoASegmento(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// segmentos: [{p1:{x,y}, p2:{x,y}}, ...] — sin asumir que encadenan en un solo camino (un muro
// real puede ramificarse), cada segmento se mide de forma independiente.
function distanciaMinimaASegmentos(px, py, segmentos) {
  let min = Infinity;
  for (const s of segmentos) {
    min = Math.min(min, distanciaPuntoASegmento(px, py, s.p1.x, s.p1.y, s.p2.x, s.p2.y));
  }
  return min;
}

function hitTestElemento(elementosPuntuales, x, y, imagenWPx, imagenHPx, mpp, radiusPx = 16) {
  let best = null, bestDist = Infinity;
  for (const e of elementosPuntuales) {
    const forma = CATEGORIAS_ELEMENTO.find(c => c.id === e.categoria)?.forma;
    let d;
    // Mismo criterio que dibujarOverlayEnCanvas: despacha por forma del dato (segmentos), no por
    // categoría — Muro y Puerta-geo comparten shape.
    if (Array.isArray(e.segmentos) && e.segmentos.length >= 1) {
      d = distanciaMinimaASegmentos(x, y, e.segmentos);
    } else if (!e._nuevo) {
      // Detectado por Colab: se dibuja (y se selecciona) como punto — ver dibujarOverlayEnCanvas.
      const cx = (e.cx_relativo ?? 0) * imagenWPx, cy = (e.cy_relativo ?? 0) * imagenHPx;
      d = Math.hypot(x - cx, y - cy);
    } else if (forma === "rectangulo") {
      const { p1, p2 } = resolverPuntosElemento(e, imagenWPx, imagenHPx, mpp);
      const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
      const rw = Math.abs(p2.x - p1.x), rh = Math.abs(p2.y - p1.y);
      d = (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) ? 0 : Infinity;
    } else {
      const { p1, p2 } = resolverPuntosElemento(e, imagenWPx, imagenHPx, mpp);
      d = distanciaPuntoASegmento(x, y, p1.x, p1.y, p2.x, p2.y);
    }
    if (d <= radiusPx && d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

// Herramientas cuyo click se interpreta como el 1º/2º punto de una línea o caja (2 clics),
// en vez de una selección directa — mismo mecanismo, distinto significado según la herramienta.
const HERRAMIENTAS_DOS_CLICS = new Set(["puerta", "ventana", "escalera", "rampa", "muro", "cortar", "excluir_area"]);

function RevisionGeometricaCanvas({
  png, mediciones, elementosPuntuales, imagenWPx, imagenHPx, mpp,
  tool, selectedId, linePoints = [], zoom = 1,
  onSeleccionar, onLinePoint, onMoverDestino, onToggleFusion,
}) {
  const canvasRef = useRef();
  const imgRef = useRef();
  const previewRef = useRef(null);

  const redibujar = useCallback((previewOverride) => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img || !img.complete || !img.naturalWidth) return;
    const ctx = canvas.getContext("2d");
    const preview = previewOverride !== undefined ? previewOverride : previewRef.current;
    dibujarOverlayEnCanvas(ctx, img, { mediciones, elementosPuntuales, imagenWPx, imagenHPx, selectedId, preview, mpp });
  }, [mediciones, elementosPuntuales, imagenWPx, imagenHPx, selectedId, mpp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !png?.objectUrl) return;
    const img = new Image();
    imgRef.current = img;
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      previewRef.current = null;
      redibujar(null);
    };
    img.src = png.objectUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [png?.objectUrl]);

  useEffect(() => { redibujar(); }, [redibujar]);
  useEffect(() => { previewRef.current = null; redibujar(null); }, [linePoints.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function puntoDesdeEvento(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handleClick(e) {
    const pt = puntoDesdeEvento(e);
    if (tool === "seleccionar") {
      // Elementos puntuales primero: casi siempre están DENTRO del bbox de un recinto,
      // así que si el recinto se revisara primero jamás se podría seleccionar el punto.
      const el = hitTestElemento(elementosPuntuales, pt.x, pt.y, imagenWPx, imagenHPx, mpp);
      if (el) { onSeleccionar?.(el.id, "elemento"); return; }
      const r = hitTestRecinto(mediciones, pt.x, pt.y);
      if (r) { onSeleccionar?.(r.id, "recinto"); return; }
      onSeleccionar?.(null, null);
      return;
    }
    if (tool === "mover") { onMoverDestino?.(pt); return; }
    if (tool === "fusionar") {
      const r = hitTestRecinto(mediciones, pt.x, pt.y);
      if (r) onToggleFusion?.(r.id);
      return;
    }
    if (HERRAMIENTAS_DOS_CLICS.has(tool)) { onLinePoint?.(pt); }
  }

  function handleMouseMove(e) {
    // Muro: sigue acumulando trazos hasta que el arquitecto confirme (botón aparte), no se
    // dispara solo al segundo clic como el resto de las herramientas de 2 clics.
    if (tool === "muro" && linePoints.length >= 1) {
      const pt = puntoDesdeEvento(e);
      previewRef.current = { tipo: "polilinea", puntos: linePoints, cursor: pt };
      redibujar(previewRef.current);
      return;
    }
    if (linePoints.length !== 1) return;
    const pt = puntoDesdeEvento(e);
    const esRectangulo = CATEGORIAS_ELEMENTO.find(c => c.id === tool)?.forma === "rectangulo" || tool === "excluir_area";
    const tipo = esRectangulo ? "rect" : "linea";
    previewRef.current = { p1: linePoints[0], p2: pt, tipo };
    redibujar(previewRef.current);
  }

  function handleMouseLeave() {
    if (previewRef.current) { previewRef.current = null; redibujar(null); }
  }

  const cursor = tool === "seleccionar" ? "pointer" : "crosshair";

  // Tamaño CSS explícito (no "100%") para que el zoom controle el tamaño real de despliegue —
  // el contenedor que lo envuelve (en RevisionModal) es el que hace scroll/pan nativo del navegador.
  // canvas.width/height (el buffer de dibujo) siempre queda a resolución nativa (ver arriba), así que
  // puntoDesdeEvento ya convierte correctamente sin importar el zoom (usa el rect renderizado real).
  const anchoCss = imagenWPx ? Math.round(imagenWPx * zoom) : undefined;
  const altoCss = imagenHPx ? Math.round(imagenHPx * zoom) : undefined;

  return (
    <canvas ref={canvasRef} onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      style={{ width: anchoCss, height: altoCss, display: "block", borderRadius: 6, border: "1px solid #D1D9EE", cursor }} />
  );
}

// ── Panel de edición de un recinto o elemento puntual seleccionado ─────────
function PanelRetag({ tipo, item, onGuardar, onEliminar, onMover, onCerrar }) {
  const [nombre, setNombre] = useState("");
  const [tipoRecinto, setTipoRecinto] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [anchoM, setAnchoM] = useState("");
  // Motivo opcional del descarte -- sobre todo relevante para Muro (dataset de fine-tuning: saber
  // POR QUÉ un muro detectado por OpenCV era un falso positivo, no solo que se borró) pero
  // disponible para cualquier elemento puntual, mismo campo simple para todos.
  const [motivoEliminar, setMotivoEliminar] = useState("");

  useEffect(() => {
    setNombre(item?.nombre ?? item?.ubicacion_o_recinto ?? "");
    setTipoRecinto(item?.tipo ?? "");
    setAreaM2(item?.area_m2 ?? "");
    setAnchoM(item?.categoria === "muro" ? (item?.largo_m ?? "") : (item?.ancho_estimado_m ?? ""));
    setMotivoEliminar("");
  }, [item]);

  if (!item) return null;
  const esRecinto = tipo === "recinto";
  const esMuro = item?.categoria === "muro";
  // Muro y Puerta-geo (2026-08-04) comparten la misma limitación v1: son una polilínea de N
  // segmentos, no un único punto/línea — "Mover" no tiene un destino único con sentido.
  const esPoligono = Array.isArray(item?.segmentos) && item.segmentos.length > 0;
  const inputStyle = { width: "100%", border: "1px solid #D1D9EE", borderRadius: 6, padding: "7px 10px", fontSize: 12, color: "#3D4A5C", fontFamily: "inherit", background: "#FFFFFF", marginBottom: 6 };
  const btnStyle = (bg) => ({ border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 11, fontFamily: "inherit", cursor: "pointer", background: bg, color: "#fff" });

  return (
    <div style={{ border: "1px solid #D1D9EE", borderRadius: 8, padding: 12, background: "#F4F6FB", marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "#6B7A99", marginBottom: 8 }}>
        {esRecinto ? `Recinto ${item.id}` : `Elemento ${item.id || "(nuevo)"} — ${item.categoria}`}
      </div>
      {esRecinto ? (
        <>
          <input style={inputStyle} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" />
          <input style={inputStyle} value={tipoRecinto} onChange={e => setTipoRecinto(e.target.value)} placeholder="Tipo (ej. bano, cocina)" />
          <input style={inputStyle} type="number" step="0.01" value={areaM2} onChange={e => setAreaM2(e.target.value)} placeholder="Área m²" />
        </>
      ) : (
        <>
          <input style={inputStyle} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ubicación / descripción" />
          <input style={inputStyle} type="number" step="0.01" value={anchoM} onChange={e => setAnchoM(e.target.value)} placeholder={esMuro ? "Largo m" : "Ancho m"} />
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <button style={btnStyle("#2952A3")} onClick={() => onGuardar(esRecinto
          ? { nombre, tipo: tipoRecinto, area_m2: parseFloat(areaM2) || 0 }
          : esMuro ? { ubicacion_o_recinto: nombre, largo_m: parseFloat(anchoM) || 0 }
          : { ubicacion_o_recinto: nombre, ancho_estimado_m: parseFloat(anchoM) || 0 })}>
          Guardar
        </button>
        {/* Mover no soportado para elementos de polilínea (Muro, Puerta-geo) en v1 — es una
            geometría de N segmentos, no un único punto; para reubicarlo hoy se elimina y se vuelve
            a marcar (mismo patrón que cambiar de categoría). */}
        {!esRecinto && !esPoligono && <button style={btnStyle("#D68910")} onClick={onMover}>Mover</button>}
        {/* Motivo obligatorio para elementos puntuales (a pedido explícito del usuario, 2026-08-07):
            sin motivo escrito el borrado no documenta nada útil para detectar patrones de falso
            positivo del extractor — el botón queda deshabilitado hasta que se escriba algo. */}
        <button style={{ ...btnStyle("#C0392B"), opacity: (!esRecinto && !motivoEliminar.trim()) ? 0.5 : 1, cursor: (!esRecinto && !motivoEliminar.trim()) ? "not-allowed" : "pointer" }}
          disabled={!esRecinto && !motivoEliminar.trim()}
          onClick={() => onEliminar(motivoEliminar)}>
          Eliminar
        </button>
        <button style={btnStyle("#B8C5E0")} onClick={onCerrar}>Cancelar</button>
      </div>
      {!esRecinto && (
        <>
          <input style={{ ...inputStyle, marginTop: 8, marginBottom: 0 }} value={motivoEliminar}
            onChange={e => setMotivoEliminar(e.target.value)}
            placeholder="Motivo del descarte (obligatorio para eliminar) — ej. 'es un mesón, no un muro'" />
          {!motivoEliminar.trim() && (
            <div style={{ fontSize: 10, color: "#C0392B", marginTop: 4 }}>Escribe un motivo para poder eliminar.</div>
          )}
        </>
      )}
    </div>
  );
}

// Solo lo que el sistema NO está seguro — nunca lo que ya considera confirmado (a pedido
// explícito del usuario). "Duda" = recinto sin nombre confirmado, recinto con incumplimiento
// geométrico detectado, o una categoría de elemento puntual con detecciones sin ubicar todavía.
function calcularDudas(mediciones, elementosDetectados) {
  const dudas = [];
  for (const r of mediciones) {
    if (r.sin_nombre_confirmar) {
      dudas.push({ tipo: "recinto", id: r.id, motivo: `${r.id}: sin nombre confirmado — ¿qué espacio es?`, item: r });
    } else if (r.cumple_geo === false) {
      dudas.push({ tipo: "recinto", id: r.id, motivo: `${r.id} (${r.nombre}): incumplimiento geométrico detectado`, item: r });
    }
  }
  for (const cat of CATEGORIAS_ELEMENTO) {
    const det = elementosDetectados[cat.id];
    if (det && det.total > det.marcadas) {
      dudas.push({ tipo: "categoria", id: cat.id, motivo: `Sistema detectó ${det.total} ${cat.label.toLowerCase()}(s), ${det.total - det.marcadas} sin ubicar en el plano — revísalas`, item: null });
    }
  }
  return dudas;
}

// ── Tabla de dudas — índice de "cosas por mirar", no un listado completo ───
function TablaDudas({ dudas, onIrADuda }) {
  if (!dudas.length) return <div style={{ fontSize: 11, color: "#1E8449", padding: "8px 0 14px" }}>✓ Sin dudas pendientes en esta página.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      {dudas.map((d, i) => (
        <button key={i} onClick={() => onIrADuda(d)}
          style={{ textAlign: "left", border: "1px solid rgba(214,137,16,0.35)", background: "rgba(214,137,16,0.06)", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#D68910", cursor: "pointer", fontFamily: "inherit" }}>
          ⚠ {d.motivo}
        </button>
      ))}
    </div>
  );
}

// ── Selector de herramienta activa ──────────────────────────────────────────
// Cortar, Fusionar y Excluir área reactivadas por pasos a pedido del usuario (2026-08-11 a
// 2026-08-17). La lógica de datos (ejecutarCorte/ejecutarFusion/calcularAreaExcluida, y su
// reintegración en getMedicionesPorPagina/construirColabJsonCorregido) nunca se tocó desde que
// se apagaron el 2 de agosto — solo faltaba la UI para dispararlas.
function LeyendaHerramientas({
  tool, onChangeTool, elementosDetectados, muroPuntosCount, onConfirmarMuro, recintoSeleccionado,
  fusionSet = [], onConfirmarFusion, areasExcluidasCount = 0,
}) {
  const base = [
    { id: "seleccionar", label: "Seleccionar" },
    { id: "cortar", label: "✂ Cortar recinto" },
    { id: "fusionar", label: "⛓ Fusionar recintos" },
    { id: "excluir_area", label: "▭ Excluir área" },
  ];
  const btnStyle = (activo, col) => ({
    border: `1px solid ${activo ? col : "#D1D9EE"}`, borderRadius: 6, padding: "6px 11px", fontSize: 11,
    fontFamily: "inherit", cursor: "pointer", background: activo ? col : "#fff", color: activo ? "#fff" : col,
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
      {base.map(b => {
        const col = b.id === "cortar" ? "#C0392B" : b.id === "fusionar" ? "#B8860B" : b.id === "excluir_area" ? "#7D3C98" : "#2952A3";
        return <button key={b.id} style={btnStyle(tool === b.id, col)} onClick={() => onChangeTool(b.id)}>{b.label}</button>;
      })}
      <span style={{ width: 1, height: 18, background: "#D1D9EE", margin: "0 4px" }} />
      {CATEGORIAS_ELEMENTO.map(cat => {
        const col = COLORES_ELEMENTO_PUNTUAL[cat.id];
        const det = elementosDetectados?.[cat.id];
        return (
          <button key={cat.id} style={btnStyle(tool === cat.id, col)} onClick={() => onChangeTool(cat.id)}>
            {cat.label}{det ? ` (${det.marcadas}/${det.total})` : ""}
          </button>
        );
      })}
      {tool === "muro" && muroPuntosCount >= 2 && (
        <button style={{ ...btnStyle(true, "#1E8449") }} onClick={onConfirmarMuro}>Confirmar muro ({muroPuntosCount} puntos)</button>
      )}
      {tool === "muro" && muroPuntosCount > 0 && muroPuntosCount < 2 && (
        <span style={{ fontSize: 10, color: "#6B7A99" }}>Marca al menos 2 puntos para confirmar el muro</span>
      )}
      {tool === "cortar" && !recintoSeleccionado && (
        <span style={{ fontSize: 10, color: "#C0392B" }}>Primero selecciona un recinto (herramienta "Seleccionar"), después vuelve a "Cortar recinto" y marca la línea de corte</span>
      )}
      {tool === "cortar" && recintoSeleccionado && (
        <span style={{ fontSize: 10, color: "#6B7A99" }}>Cortando <strong>{recintoSeleccionado}</strong> — marca 2 puntos para trazar la línea de corte</span>
      )}
      {tool === "fusionar" && fusionSet.length >= 2 && (
        <button style={{ ...btnStyle(true, "#1E8449") }} onClick={onConfirmarFusion}>Confirmar fusión de {fusionSet.length} recintos ({fusionSet.join(", ")})</button>
      )}
      {tool === "fusionar" && fusionSet.length === 1 && (
        <span style={{ fontSize: 10, color: "#6B7A99" }}>Marcado <strong>{fusionSet[0]}</strong> — hace falta al menos 1 recinto más (clic para agregar, clic de nuevo para sacarlo)</span>
      )}
      {tool === "fusionar" && fusionSet.length === 0 && (
        <span style={{ fontSize: 10, color: "#6B7A99" }}>Haz clic sobre 2 o más recintos para marcarlos, después confirma la fusión</span>
      )}
      {tool === "excluir_area" && !recintoSeleccionado && (
        <span style={{ fontSize: 10, color: "#C0392B" }}>Primero selecciona un recinto (herramienta "Seleccionar"), después vuelve a "Excluir área" y marca el rectángulo (2 clics: esquina a esquina)</span>
      )}
      {tool === "excluir_area" && recintoSeleccionado && (
        <span style={{ fontSize: 10, color: "#6B7A99" }}>
          Excluyendo área de <strong>{recintoSeleccionado}</strong> — marca 2 esquinas del rectángulo a restar
          {areasExcluidasCount > 0 ? ` (${areasExcluidasCount} zona${areasExcluidasCount > 1 ? "s" : ""} ya excluida${areasExcluidasCount > 1 ? "s" : ""} en este recinto — podés marcar más)` : ""}
        </span>
      )}
    </div>
  );
}

// ── Bloque completo de revisión gráfica (compone canvas + panel + tabla + leyenda) ──
// ── Tarjeta compacta que dispara el modal de revisión (no muestra el editor inline) ──
function RevisionGraficaGeometria({ entriesConPng, revisionConfirmada, onAbrirModal, onExportarDataset }) {
  if (!entriesConPng.length) return null;
  return (
    <div style={{ marginBottom: 18, border: `1px solid ${revisionConfirmada ? "#1E8449" : "#E74C3C"}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: "#F4F6FB", borderBottom: "1px solid #D1D9EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px" }}>REVISIÓN GRÁFICA DE GEOMETRÍA</span>
        <span style={{ fontSize: 10, color: revisionConfirmada ? "#1E8449" : "#E74C3C" }}>
          {revisionConfirmada ? "✓ confirmada" : "requerido para analizar"}
        </span>
      </div>
      <div style={{ padding: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6B7A99" }}>
          {entriesConPng.length} página{entriesConPng.length > 1 ? "s" : ""} lista{entriesConPng.length > 1 ? "s" : ""} para revisar, una por una, en pantalla completa.
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Exportar el dataset de muros no requiere correr el análisis completo (pago) — solo
              necesita la revisión gráfica confirmada, por eso vive acá y no en la pantalla de
              informe final (donde vivía antes, mal ubicado: obligaba a un análisis real solo para
              descargar el dataset). */}
          {revisionConfirmada && (
            <button onClick={onExportarDataset}
              style={{ border: "1px solid #2952A3", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: "#fff", color: "#2952A3" }}>
              📦 Exportar dataset de muros
            </button>
          )}
          <button onClick={onAbrirModal}
            style={{ border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: "linear-gradient(90deg,#1B3A8A,#2952A3)", color: "#fff" }}>
            {revisionConfirmada ? "Revisar de nuevo →" : "Revisar geometría →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const zoomBtnStyle = { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer" };
const navBtnStyle = (primary) => ({ border: primary ? "none" : "1px solid #D1D9EE", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: primary ? "linear-gradient(90deg,#1B3A8A,#2952A3)" : "#fff", color: primary ? "#fff" : "#3D4A5C" });

// ── Modal de revisión gráfica — una página a la vez, a pantalla casi completa, con zoom + scroll
// nativo del navegador para "moverse con el mouse" (wheel/trackpad/scrollbar). El toolbar queda fijo
// arriba (no se mueve con el scroll del plano). Solo avanza a la página siguiente cuando el
// arquitecto decide que terminó — no hay avance automático ni por tiempo.
function RevisionModal({
  colabJson, colabPngs, correcciones,
  entriesConPng, stepIndex, setStepIndex,
  tool, setTool, selectedId, selectedTipo, linePoints, fusionSet = [],
  onSeleccionar, onLinePoint, onMoverDestino, onConfirmarMuro, onToggleFusion, onConfirmarFusion,
  onGuardarRecinto, onEliminarRecinto, onGuardarElemento, onEliminarElemento, onMoverElemento, onCerrarPanel,
  onFinalizar, onCerrarModal,
}) {
  const containerRef = useRef();
  const [zoom, setZoom] = useState(1);
  const [focusPoint, setFocusPoint] = useState(null);

  const entryIdx = entriesConPng[stepIndex];
  const png = colabPngs.find(p => p.entryIdx === entryIdx);
  const pagJson = colabJson?.paginas?.find(p => p.entry_idx === entryIdx);
  const mediciones = entryIdx != null ? getMedicionesPorPagina(colabJson, correcciones, entryIdx) : [];
  const elementosPuntuales = entryIdx != null ? getElementosPuntualesConPosicion(colabJson, correcciones, entryIdx) : [];
  const elementosDetectados = entryIdx != null ? calcularElementosDetectadosResumen(colabJson, correcciones, entryIdx) : {};
  const dudas = calcularDudas(mediciones, elementosDetectados);
  const areasExcluidasCount = selectedTipo === "recinto" && selectedId
    ? correcciones.areasExcluidas.filter(a => a.entryIdx === entryIdx && a.recintoId === selectedId).length
    : 0;

  const recintoSel = selectedTipo === "recinto" ? mediciones.find(r => r.id === selectedId) : null;
  const elementoSel = selectedTipo === "elemento" ? elementosPuntuales.find(e => e.id === selectedId) : null;

  // Al cambiar de página: zoom "ajustar a ancho" (página casi completa) y sin selección/foco previos.
  useEffect(() => {
    const cw = containerRef.current?.clientWidth || 800;
    if (pagJson?.imagen_w_px) setZoom(Math.min(1, (cw - 32) / pagJson.imagen_w_px));
    setFocusPoint(null);
    onCerrarPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryIdx]);

  // Centrar el scroll sobre el punto de una duda seleccionada desde la tabla.
  useEffect(() => {
    if (!focusPoint || !containerRef.current) return;
    const c = containerRef.current;
    c.scrollTo({ left: Math.max(0, focusPoint.px * zoom - c.clientWidth / 2), top: Math.max(0, focusPoint.py * zoom - c.clientHeight / 2), behavior: "smooth" });
  }, [focusPoint, zoom]);

  function irADuda(duda) {
    if (duda.tipo === "recinto" && duda.item?.bbox) {
      const { x, y, w, h } = duda.item.bbox;
      setZoom(z => Math.max(z, 1.2));
      setFocusPoint({ px: x + w / 2, py: y + h / 2 });
      onSeleccionar(duda.item.id, "recinto");
    } else if (duda.tipo === "categoria") {
      setTool(duda.id);
    }
  }

  if (!png || !pagJson) return null;
  const esUltima = stepIndex >= entriesConPng.length - 1;

  // React Portal a document.body: si se renderizara en el árbol normal, cualquier ancestro con
  // transform/filter/will-change (común en apps grandes con animaciones) crea un "containing
  // block" nuevo y position:fixed deja de anclarse al viewport real — se vio pasar exactamente
  // eso en la primera prueba (el header del sitio seguía encima, la página seguía scrolleando
  // detrás del modal). El portal evita el problema de raíz en vez de perseguir qué ancestro lo causa.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,26,40,0.82)", zIndex: 1000, display: "flex", flexDirection: "column", fontFamily: "inherit" }}>
      <div style={{ background: "#1B3A8A", color: "#fff", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          Página {pagJson.pagina}{pagJson.fname_tag ? ` — ${pagJson.fname_tag}` : ""} · {stepIndex + 1}/{entriesConPng.length}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setZoom(z => Math.max(0.15, +(z - 0.2).toFixed(2)))} style={zoomBtnStyle}>−</button>
          <span style={{ fontSize: 11, minWidth: 42, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))} style={zoomBtnStyle}>+</button>
          <button onClick={onCerrarModal} style={{ ...zoomBtnStyle, marginLeft: 10 }}>✕ Cerrar</button>
        </div>
      </div>

      <div style={{ background: "#F4F6FB", padding: "8px 18px", borderBottom: "1px solid #D1D9EE" }}>
        <LeyendaHerramientas tool={tool} onChangeTool={setTool} elementosDetectados={elementosDetectados}
          muroPuntosCount={linePoints.length} onConfirmarMuro={onConfirmarMuro}
          recintoSeleccionado={selectedTipo === "recinto" ? selectedId : null}
          fusionSet={fusionSet} onConfirmarFusion={onConfirmarFusion}
          areasExcluidasCount={areasExcluidasCount} />
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div ref={containerRef} style={{ flex: 1, overflow: "auto", background: "#20242E", padding: 16 }}>
          <RevisionGeometricaCanvas
            png={png} mediciones={mediciones} elementosPuntuales={elementosPuntuales}
            imagenWPx={pagJson.imagen_w_px} imagenHPx={pagJson.imagen_h_px} mpp={pagJson.mpp}
            tool={tool} selectedId={selectedId} linePoints={linePoints} zoom={zoom}
            onSeleccionar={onSeleccionar} onLinePoint={onLinePoint} onMoverDestino={onMoverDestino}
            onToggleFusion={onToggleFusion}
          />
        </div>
        <div style={{ width: 320, background: "#fff", borderLeft: "1px solid #D1D9EE", padding: 14, overflowY: "auto" }}>
          <div style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "1.5px", marginBottom: 8 }}>DUDAS EN ESTA PÁGINA ({dudas.length})</div>
          <TablaDudas dudas={dudas} onIrADuda={irADuda} />
          {(recintoSel || elementoSel) && (
            <PanelRetag
              tipo={selectedTipo}
              item={recintoSel || elementoSel}
              onGuardar={patch => recintoSel ? onGuardarRecinto(patch) : onGuardarElemento(elementoSel, patch)}
              onEliminar={motivo => recintoSel ? onEliminarRecinto() : onEliminarElemento(elementoSel, motivo)}
              onMover={onMoverElemento}
              onCerrar={onCerrarPanel}
            />
          )}
        </div>
      </div>

      <div style={{ background: "#F4F6FB", borderTop: "1px solid #D1D9EE", padding: "10px 18px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {stepIndex > 0 && (
          <button onClick={() => setStepIndex(i => i - 1)} style={navBtnStyle(false)}>← Página anterior</button>
        )}
        <button onClick={() => esUltima ? onFinalizar() : setStepIndex(i => i + 1)} style={navBtnStyle(true)}>
          {esUltima ? "Finalizar y confirmar geometría →" : "Página siguiente →"}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Componentes de resultados ───────────────────────────────────────────────
function SectionTitle({ children }) {
  return <h3 style={{ fontSize:14, fontWeight:700, color:"#1B3A8A", margin:"0 0 12px", paddingBottom:8, borderBottom:"2px solid #EEF2FB", display:"flex", alignItems:"center", gap:8 }}>{children}</h3>;
}

function ElemLabel({ nombre, id }) {
  if (!id) return <>{nombre}</>;
  const esEspacio = nombre && nombre.startsWith("Espacio E");
  return (
    <>
      {!esEspacio && <>{nombre} </>}
      <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700, color:"#2952A3", background:"#EEF3FF", borderRadius:3, padding:"1px 5px", border:"1px solid #C5D5F0", whiteSpace:"nowrap" }}>{id}</span>
    </>
  );
}

function StatusBadge({ val }) {
  const cfg = {
    OK:       { bg:"rgba(30,132,73,0.08)",   bo:"rgba(30,132,73,0.25)",   c:"#1E8449" },
    SI:       { bg:"rgba(30,132,73,0.08)",   bo:"rgba(30,132,73,0.25)",   c:"#1E8449" },
    OBSERVADO:{ bg:"rgba(214,137,16,0.08)", bo:"rgba(214,137,16,0.25)", c:"#D68910" },
    VERIFICAR:{ bg:"rgba(74,114,196,0.08)", bo:"rgba(74,114,196,0.25)", c:"#2952A3" },
    NO:       { bg:"rgba(192,57,43,0.08)",  bo:"rgba(192,57,43,0.25)",  c:"#C0392B" },
    INCUMPLE: { bg:"rgba(192,57,43,0.08)",  bo:"rgba(192,57,43,0.25)",  c:"#C0392B" },
  };
  const s = cfg[val] || cfg.VERIFICAR;
  return <span style={{ fontSize:10, fontWeight:700, color:s.c, background:s.bg, border:`1px solid ${s.bo}`, borderRadius:99, padding:"2px 8px", whiteSpace:"nowrap" }}>{val}</span>;
}

function ObsCard({ obs, obsKey, obsState, onAction, onComment }) {
  const cs = critStyle(obs.criticidad);
  const isResolved = !!obsState?.status;
  return (
    <div className="obs-card" style={{ ...cs, borderRadius:8, padding:"12px 14px", opacity:obsState?.status === "descartada" ? 0.5 : 1 }}>
      <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:6 }}>
        <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.5, flex:1 }}>
          {obs._codigo && <span style={{ marginRight:7, display:"inline-block" }}><CodigoBadge codigo={obs._codigo} size={10} /></span>}
          {obs.descripcion}
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4, flexShrink:0 }}>
          <span style={{ fontSize:10, fontWeight:700, color:cs.color, background:cs.background, border:cs.border, borderRadius:4, padding:"2px 8px" }}>{obs.criticidad}</span>
          {isResolved && <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[obsState.status], background:STATUS_COLORS[obsState.status]+"18", border:`1px solid ${STATUS_COLORS[obsState.status]}40`, borderRadius:4, padding:"1px 7px", whiteSpace:"nowrap" }}>✓ {STATUS_LABELS[obsState.status]}</span>}
        </div>
      </div>
      {obs.articulo && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:obs.correccion ? 8 : 6 }}>
          {obs.articulo.split(/[,;]/).map(p => p.trim()).filter(Boolean).map((p,pi) => (
            <span key={pi} style={{ fontSize:10, color:"#2952A3", background:"rgba(41,82,163,0.08)", border:"1px solid rgba(41,82,163,0.2)", borderRadius:4, padding:"2px 7px", fontFamily:"'DM Mono',monospace" }}>§ {p}</span>
          ))}
        </div>
      )}
      {obs.correccion && <div style={{ fontSize:12, color:"#6B7A99", borderTop:"1px solid #D1D9EE", paddingTop:8, marginTop:4, lineHeight:1.5, marginBottom:8 }}><span style={{ color:"#2952A3" }}>→ </span>{obs.correccion}</div>}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8, paddingTop:8, borderTop:"1px solid rgba(0,0,0,0.06)" }}>
        {OBS_ACTIONS.map(a => {
          const active = obsState?.status === a.id;
          return <button key={a.id} onClick={() => onAction(obsKey, a.id)} style={{ padding:"3px 9px", fontSize:10, borderRadius:5, border:`1px solid ${active ? a.color : "#D1D9EE"}`, background:active ? a.color+"18" : "transparent", color:active ? a.color : "#6B7A99", cursor:"pointer", fontFamily:"inherit", fontWeight:active ? 700 : 400, transition:"all .15s" }}>{a.label}</button>;
        })}
      </div>
      {obsState?.status === "comentada" && (
        <textarea value={obsState?.comment || ""} onChange={e => onComment(obsKey, e.target.value)} placeholder="Escribe tu comentario..." style={{ marginTop:8, width:"100%", border:"1px solid #D1D9EE", borderRadius:6, padding:"8px 10px", fontSize:11, fontFamily:"inherit", color:"#3D4A5C", resize:"vertical", minHeight:60, outline:"none", background:"#FFFFFF" }} />
      )}
    </div>
  );
}

// ── PrintReport — layout dedicado para PDF ──────────────────────────────────
function PrintReport({ result, obsStatus, tipo, comuna, archivos, colabPngs, verificadorResult, fichaProyecto }) {
  const ec = globalStyle(result.estado_global);
  const tienePRC = !!PRC_COMUNAS[comuna];
  const todas = getConsolidado(result);
  const altas = todas.filter(x => x.obs.criticidad === "ALTA");
  const tecnicas = todas.filter(x => x.obs.criticidad !== "ALTA");
  const resueltas = Object.values(obsStatus).filter(s => s?.status).length;
  const total = todas.length;
  const totalRecintos = (result.capa1?.reconocimiento?.recintos_por_nivel || [])
    .reduce((acc, n) => acc + (n.recintos?.length || 0), 0);

  const PTH = { padding:"5px 9px", textAlign:"left", color:"#fff", fontWeight:700, fontSize:9, background:"#1B3A8A", whiteSpace:"nowrap" };
  const PTD = { padding:"5px 9px", borderBottom:"1px solid #e8ecf5", fontSize:10, color:"#2d3748", verticalAlign:"top" };

  function EtapaTitle({ label, subtitle, badge, c2 = false }) {
    const col = c2 ? "#D68910" : "#2952A3";
    return (
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12, pageBreakInside:"avoid" }}>
        <div>
          <h2 style={{ fontSize:14, fontWeight:800, color:"#1B3A8A", fontFamily:"Arial,sans-serif", margin:"0 0 2px" }}>{label}</h2>
          {subtitle && <p style={{ color:"#6B7A99", fontSize:9, margin:0 }}>{subtitle}</p>}
        </div>
        <span style={{ fontSize:8, fontWeight:700, padding:"2px 9px", borderRadius:99, background:`${col}14`, color:col, border:`1px solid ${col}40`, whiteSpace:"nowrap", flexShrink:0 }}>{badge}</span>
      </div>
    );
  }

  function CapaBanner({ children }) {
    return <div style={{ background:"#1B3A8A", color:"#fff", padding:"7px 12px", borderRadius:5, marginBottom:18, fontSize:10, fontWeight:700, letterSpacing:"0.5px", pageBreakInside:"avoid", breakInside:"avoid" }}>{children}</div>;
  }

  function PrintTable({ headers, rows }) {
    if (!rows?.length) return <p style={{ fontSize:9, color:"#B8C5E0", margin:"0 0 12px" }}>Sin datos</p>;
    return (
      <div style={{ overflowX:"auto", marginBottom:12 }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>{headers.map(h => <th key={h} style={PTH}>{h}</th>)}</tr></thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  const pg = { marginTop:28, paddingTop:20, borderTop:"3px solid #EEF2FB" };

  return (
    <div style={{ padding:"18mm 16mm", fontFamily:"Arial,sans-serif", fontSize:11, color:"#1a1a1a", background:"#fff", width:"210mm", boxSizing:"border-box" }}>

      {/* PORTADA */}
      <div style={{ paddingBottom:20 }}>
        <div style={{ borderBottom:"3px solid #1B3A8A", paddingBottom:14, marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:9, color:"#6B7A99", letterSpacing:"3px", marginBottom:4 }}>INFORME DE REVISIÓN NORMATIVA</div>
            <h1 style={{ fontSize:22, fontWeight:900, color:"#1B3A8A", fontFamily:"Arial,sans-serif", margin:"0 0 2px" }}>ArchiCheck</h1>
            <div style={{ fontSize:13, color:"#3D4A5C", fontWeight:600 }}>{TIPOS.find(t => t.id === tipo)?.label} · {PRC_COMUNAS[comuna]?.meta?.nombre || comuna}</div>
            <div style={{ fontSize:10, color:"#6B7A99", marginTop:3 }}>{new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:"1.5px", padding:"4px 14px", borderRadius:99, ...ec }}>{result.estado_global}</span>
          </div>
        </div>
        <div style={{ borderLeft:"4px solid #1B3A8A", background:"#F4F6FB", borderRadius:"0 8px 8px 0", padding:"12px 16px", marginBottom:20, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px 20px" }}>
          {[
            { label:"TIPO DE PROYECTO", value:TIPOS.find(t => t.id === tipo)?.label },
            { label:"DOCUMENTOS", value:archivos.map(f => f.name).join(", ") },
            { label:"NORMATIVA", value:["OGUC","LGUC",tienePRC?`PRC ${PRC_COMUNAS[comuna].meta.nombre}`:null].filter(Boolean).join(" · ") },
            { label:"FECHA", value:new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"}) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize:7, color:"#6B7A99", letterSpacing:"1.5px", marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:9, color:"#3D4A5C", fontWeight:600, lineHeight:1.4, wordBreak:"break-word" }}>{value}</div>
            </div>
          ))}
        </div>
        {result.tabla_observaciones?.length > 0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:7, color:"#6B7A99", letterSpacing:"2px", marginBottom:8 }}>RESUMEN POR TEMA</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:8 }}>
              <thead>
                <tr style={{ background:"#F4F6FB" }}>
                  <th style={{ padding:"3px 8px" }}></th>
                  <th style={{ padding:"3px 8px", textAlign:"center", fontWeight:700, color:"#C0392B", letterSpacing:"0.5px" }}>Incumplimientos</th>
                  <th colSpan={2} style={{ padding:"3px 8px", textAlign:"center", fontWeight:700, color:"#D68910", letterSpacing:"0.5px" }}>Observaciones</th>
                </tr>
                <tr style={{ background:"#EEF2FB" }}>{["Tema","Alta","Media","Baja"].map(h => <th key={h} style={{ padding:"4px 8px", textAlign:h==="Tema"?"left":"center", fontWeight:700, color:"#1B3A8A", letterSpacing:"0.5px" }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {result.tabla_observaciones.map((g, i) => {
                  const obs = g.observaciones || [];
                  const a = obs.filter(o => o.criticidad === "ALTA").length;
                  const m = obs.filter(o => o.criticidad === "MEDIA").length;
                  const b = obs.filter(o => o.criticidad === "BAJA").length;
                  return <tr key={i} style={{ borderBottom:"1px solid #EEF2FB" }}><td style={{ padding:"4px 8px", color:"#3D4A5C", fontWeight:500 }}>{g.tema}</td><td style={{ padding:"4px 8px", textAlign:"center", color:a>0?"#C0392B":"#B8C5E0", fontWeight:a>0?700:400 }}>{a||"—"}</td><td style={{ padding:"4px 8px", textAlign:"center", color:m>0?"#D68910":"#B8C5E0", fontWeight:m>0?700:400 }}>{m||"—"}</td><td style={{ padding:"4px 8px", textAlign:"center", color:b>0?"#6B7A99":"#B8C5E0" }}>{b||"—"}</td></tr>;
                })}
                <tr style={{ borderTop:"2px solid #1B3A8A", background:"#F8F9FF" }}>
                  <td style={{ padding:"5px 8px", fontWeight:800, color:"#1B3A8A" }}>Total</td>
                  <td style={{ padding:"5px 8px", textAlign:"center", fontWeight:800, color:"#C0392B" }}>{altas.length || "—"}</td>
                  <td colSpan={2} style={{ padding:"5px 8px", textAlign:"center", fontWeight:800, color:"#D68910" }}>{tecnicas.length || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p style={{ fontSize:11, color:"#3D4A5C", lineHeight:1.7, marginBottom:20 }}>{fixResumenGeneral(result.resumen_general, altas.length, tecnicas.length)}</p>
      </div>

      {/* ── CAPA 1 ── */}
      <div>
        <CapaBanner>CAPA 1 — LEVANTAMIENTO GEOMÉTRICO</CapaBanner>

        {/* E1 */}
        <EtapaTitle label="Etapa 1 — Separación Gráfica" subtitle="El sistema distingue geometría real vs. texto, cotas, simbología y ruido visual" badge="Capa 1 · 1/4" />
        <PrintTable
          headers={["Capa","Contenido identificado","Páginas","Estado"]}
          rows={(result.capa1?.separacion?.capas || []).map((c, i) => (
            <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
              <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{c.nombre}</td>
              <td style={PTD}>{c.contenido}</td>
              <td style={{ ...PTD, whiteSpace:"nowrap" }}>{c.paginas}</td>
              <td style={PTD}><StatusBadge val={c.estado} /></td>
            </tr>
          ))}
        />
        <EtapaRefs refs={result.capa1?.separacion?._refs} />

        {/* E2 */}
        <div style={pg}>
          <CapaBanner>CAPA 1 — LEVANTAMIENTO GEOMÉTRICO</CapaBanner>
          <EtapaTitle label="Etapa 2 — Reconocimiento de Elementos" subtitle="El sistema identifica recintos, circulaciones y elementos relevantes por nivel" badge="Capa 1 · 2/4" />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
            {[
              { n:result.capa1?.reconocimiento?.stats?.recintos_total??0, label:"Recintos identificados", c:"#1B3A8A" },
              { n:result.capa1?.reconocimiento?.stats?.niveles??0,         label:"Niveles procesados",    c:"#2952A3" },
              { n:result.capa1?.reconocimiento?.observaciones?.length??0,  label:"Observaciones",         c:"#D68910" },
            ].map(m => (
              <div key={m.label} style={{ border:"1px solid #D1D9EE", borderRadius:6, padding:"8px", textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:900, color:m.c, lineHeight:1 }}>{m.n}</div>
                <div style={{ fontSize:8, color:"#6B7A99", marginTop:2 }}>{m.label}</div>
              </div>
            ))}
          </div>
          {(result.capa1?.reconocimiento?.recintos_por_nivel || []).map((nivel, ni) => (
            <div key={ni} style={{ marginBottom:14, pageBreakInside:"avoid" }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1px", marginBottom:5, background:"#EEF2FB", padding:"4px 8px", borderRadius:4 }}>NIVEL: {nivel.nivel}</div>
              <PrintTable
                headers={["Recinto","Uso","Superficie m²","Estado"]}
                rows={(nivel.recintos || []).map((r, i) => (
                  <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                    <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}><ElemLabel nombre={r.nombre} id={r._colab_id} /></td>
                    <td style={PTD}>{r.uso || "—"}</td>
                    <td style={PTD}>{r.superficie_m2!=null ? <>{r.superficie_m2}{r._from_colab && <span title="Estimación OpenCV Colab" style={{color:"#B8C5E0",fontSize:9}}> ~</span>}</> : "—"}</td>
                    <td style={PTD}><StatusBadge val={r.estado} /></td>
                  </tr>
                ))}
              />
            </div>
          ))}
          <EtapaRefs refs={result.capa1?.reconocimiento?._refs} />
        </div>

        {/* E3 */}
        <div style={pg}>
          <CapaBanner>CAPA 1 — LEVANTAMIENTO GEOMÉTRICO</CapaBanner>
          <EtapaTitle label="Etapa 3 — Vectorización" subtitle="Elementos geométricos extraídos y clasificados del plano" badge="Capa 1 · 3/4" />
          <PrintTable
            headers={["Tipo","Cant.","Descripción","Páginas","Estado"]}
            rows={(result.capa1?.vectorizacion?.elementos || []).map((e, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{e.tipo}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{e.cantidad}</td>
                <td style={PTD}>{e.descripcion}</td>
                <td style={{ ...PTD, whiteSpace:"nowrap" }}>{e.paginas}</td>
                <td style={PTD}><StatusBadge val={e.estado} /></td>
              </tr>
            ))}
          />
          <EtapaRefs refs={result.capa1?.vectorizacion?._refs} />
        </div>

        {/* E4 */}
        <div style={pg}>
          <CapaBanner>CAPA 1 — LEVANTAMIENTO GEOMÉTRICO</CapaBanner>
          <EtapaTitle label="Etapa 4 — Modelo Estructural" subtitle="Organización funcional, accesos y sistemas de evacuación" badge="Capa 1 · 4/4" />
          <div style={{ fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1px", marginBottom:6 }}>ORGANIZACIÓN FUNCIONAL</div>
          <PrintTable
            headers={["Nivel","Uso","Área m²","Conexión"]}
            rows={(result.capa1?.modelo?.organizacion_funcional || []).map((o, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{o.nivel}</td>
                <td style={PTD}>{o.uso}</td>
                <td style={PTD}>{o.area_m2 ?? "—"}</td>
                <td style={PTD}>{o.conexion || "—"}</td>
              </tr>
            ))}
          />
          <div style={{ fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1px", marginBottom:6, marginTop:10 }}>ACCESOS Y EVACUACIÓN</div>
          <PrintTable
            headers={["Elemento","Estado","Nota"]}
            rows={(result.capa1?.modelo?.accesos_evacuacion || []).map((a, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{a.elemento}</td>
                <td style={PTD}><StatusBadge val={a.estado} /></td>
                <td style={PTD}>{a.nota || "—"}</td>
              </tr>
            ))}
          />
          <EtapaRefs refs={result.capa1?.modelo?._refs} />
        </div>
      </div>

      {/* ── CAPA 2 ── */}
      <div style={pg}>
        <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>

        {/* N1 */}
        <EtapaTitle label="Etapa A — Recintos y Superficies" subtitle="Verificación de superficies mínimas por tipo de recinto según OGUC" badge="Capa 2 · A/D" c2 />
        <PrintTable
          headers={["Recinto","Uso","Sup. real m²","Sup. mín. m²","Cumple","Artículo"]}
          rows={(result.capa2?.recintos_superficies?.tabla || []).map((r, i) => (
            <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
              <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{r.recinto}</td>
              <td style={PTD}>{r.uso || "—"}</td>
              <td style={PTD}>{r.sup_real_m2 ?? "—"}</td>
              <td style={PTD}>{r.sup_minima_m2 ?? "—"}</td>
              <td style={PTD}><StatusBadge val={r.cumple} /></td>
              <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{r.articulo || "—"}</td>
            </tr>
          ))}
        />
        <EtapaRefs refs={result.capa2?.recintos_superficies?._refs} />

        {/* N2 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa B — Circulaciones" subtitle="Verificación de anchos mínimos de pasillos, escaleras y accesos según OGUC" badge="Capa 2 · B/D" c2 />
          <PrintTable
            headers={["Elemento","Ancho real (m)","Ancho mín. (m)","Artículo","Cumple"]}
            rows={(result.capa2?.circulaciones?.tabla || []).map((r, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}><ElemLabel nombre={r.elemento} id={r._colab_id} /></td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ancho_real_m ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ancho_minimo_m ?? "—"}</td>
                <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{r.articulo || "—"}</td>
                <td style={PTD}><StatusBadge val={r.cumple} /></td>
              </tr>
            ))}
          />
          <EtapaRefs refs={result.capa2?.circulaciones?._refs} />
        </div>

        {/* N3 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa C — Iluminación y Ventilación" subtitle="Verificación de relación ventana/área de recinto según OGUC Art. 4.5.7" badge="Capa 2 · C/D" c2 />
          {(result.capa2?.iluminacion_ventilacion?.tabla || []).every(r => !r.area_ventana_m2) && (
            <p style={{ fontSize:9, color:"#7B5800", background:"#FFF8E1", border:"1px solid #F9A825", borderRadius:4, padding:"5px 8px", marginBottom:6 }}>
              ⚠ Áreas de ventana no detectadas automáticamente. Verificar cuadro de vanos en el plano (OGUC Art. 4.5.7).
            </p>
          )}
          <PrintTable
            headers={["Recinto","Área ventana m²","Área recinto m²","Ratio req.","Cumple"]}
            rows={(result.capa2?.iluminacion_ventilacion?.tabla || []).map((r, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}><ElemLabel nombre={r.recinto} id={r._colab_id} /></td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.area_ventana_m2 ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.area_recinto_m2 ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ratio_requerido || "1/6"}</td>
                <td style={PTD}><StatusBadge val={r.cumple} /></td>
              </tr>
            ))}
          />
          <EtapaRefs refs={result.capa2?.iluminacion_ventilacion?._refs} />
        </div>

        {/* N4 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa D — Normativa Urbanística" subtitle="Verificación de constructibilidad, altura, COS y uso de suelo" badge="Capa 2 · D/D" c2 />
          {verificadorResult?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "#2952A3", letterSpacing: "1.5px", marginBottom: 6 }}>
                VERIFICACIÓN DETERMINISTA — ZONA {fichaProyecto?.zonaId}
              </div>
              <PrintTable
                headers={["Parámetro","Proyectado","Límite normativo","Cumple","Referencia"]}
                rows={verificadorResult.map((r, i) => (
                  <tr key={i} style={{ background: i%2===0?"#fff":"#f8f9ff" }}>
                    <td style={{ ...PTD, fontWeight: 700, color: "#1B3A8A" }}>{r.parametro}</td>
                    <td style={PTD}>{r.propuesto}</td>
                    <td style={{ ...PTD, fontFamily: "monospace", fontSize: 9 }}>{r.limiteNormativo}</td>
                    <td style={PTD}><StatusBadge val={r.cumple === true ? "OK" : r.cumple === false ? "NO" : "VERIFICAR"} /></td>
                    <td style={{ ...PTD, fontFamily: "monospace", fontSize: 9, color: "#2952A3" }}>{r.referencia}</td>
                  </tr>
                ))}
              />
            </div>
          )}
          <PrintTable
            headers={["Parámetro","Referencia normativa","Valor del proyecto","Estado"]}
            rows={(result.capa2?.normativa_urbanistica?.tabla || []).map((r, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{r.parametro}</td>
                <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{r.referencia}</td>
                <td style={PTD}>{r.valor_proyecto}</td>
                <td style={PTD}><StatusBadge val={r.estado} /></td>
              </tr>
            ))}
          />
          <EtapaRefs refs={result.capa2?.normativa_urbanistica?._refs} />
        </div>

        {/* N5 — Consolidación */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa E — Consolidación" subtitle="Revisión final de todas las observaciones" badge="Capa 2 · E/E" c2 />
          {altas.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#C0392B", letterSpacing:"1.5px", marginBottom:8 }}>INCUMPLIMIENTOS — {altas.length}</div>
              {altas.map(({ obs, key, tema }) => {
                const st = obsStatus[key];
                return (
                  <div key={key} className="obs-no-break" style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.04)", borderRadius:"0 6px 6px 0", padding:"8px 10px", marginBottom:6, pageBreakInside:"avoid", breakInside:"avoid" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:3 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <CodigoBadge codigo={obs._codigo} size={9} />
                        <span style={{ fontSize:9, fontWeight:700, color:"#C0392B" }}>{tema}</span>
                      </div>
                      {st?.status && <span style={{ fontSize:8, fontWeight:600, color:STATUS_COLORS[st.status], background:STATUS_COLORS[st.status]+"18", border:`1px solid ${STATUS_COLORS[st.status]}40`, borderRadius:99, padding:"1px 5px" }}>✓ {STATUS_LABELS[st.status]}</span>}
                    </div>
                    <div style={{ fontSize:10, color:"#3D4A5C", lineHeight:1.4, marginBottom:4 }}>{obs.descripcion}</div>
                    {obs.articulo && <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom:4 }}>{obs.articulo.split(/[,;]/).map(p => p.trim()).filter(Boolean).map((p, pi) => <span key={pi} style={{ fontSize:8, color:"#2952A3", background:"rgba(41,82,163,0.08)", border:"1px solid rgba(41,82,163,0.2)", borderRadius:3, padding:"1px 4px", fontFamily:"monospace" }}>§ {p}</span>)}</div>}
                    {obs.correccion && <div style={{ fontSize:9, color:"#6B7A99", borderTop:"1px solid rgba(192,57,43,0.15)", paddingTop:4, lineHeight:1.4 }}><span style={{ color:"#C0392B", fontWeight:700 }}>→ </span>{obs.correccion}</div>}
                    {st?.comment && <div style={{ fontSize:9, color:"#2952A3", marginTop:3, fontStyle:"italic" }}>Nota: {st.comment}</div>}
                  </div>
                );
              })}
            </div>
          )}
          {tecnicas.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#D68910", letterSpacing:"1.5px", marginBottom:8 }}>OBSERVACIONES TÉCNICAS — {tecnicas.length}</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Cód.","Tema","Descripción","Criticidad","Artículo"].map(h => <th key={h} style={PTH}>{h}</th>)}</tr></thead>
                <tbody>{tecnicas.map(({ obs, key, tema }, i) => (
                  <tr key={key} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                    <td style={PTD}>{obs._codigo ? <CodigoBadge codigo={obs._codigo} size={9} pill={false} /> : "—"}</td>
                    <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A", whiteSpace:"nowrap" }}>{tema}</td>
                    <td style={PTD}>{obs.descripcion}</td>
                    <td style={PTD}><StatusBadge val={obs.criticidad === "ALTA" ? "INCUMPLE" : obs.criticidad === "MEDIA" ? "OBSERVADO" : "OK"} /></td>
                    <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{obs.articulo || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {result.discrepancias_ensamble?.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#7D3C98", letterSpacing:"1.5px", marginBottom:8 }}>DISCREPANCIAS ENTRE MODELOS — {result.discrepancias_ensamble.length}</div>
              <div style={{ fontSize:9, color:"#6B7A99", marginBottom:8, lineHeight:1.4 }}>Claude y GPT-4o no coincidieron en estos casos — revisar antes de confiar en el veredicto automático.</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>{["Tabla","Ítem","Campo","Claude","GPT-4o"].map(h => <th key={h} style={PTH}>{h}</th>)}</tr></thead>
                <tbody>{result.discrepancias_ensamble.map((d, i) => (
                  <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                    <td style={{ ...PTD, whiteSpace:"nowrap", color:"#6B7A99" }}>{d.tabla}</td>
                    <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{d.item}</td>
                    <td style={{ ...PTD, fontFamily:"monospace", fontSize:9 }}>{d.campo === "_presencia" ? "detección" : d.campo}</td>
                    <td style={PTD}>{d.valor_claude}</td>
                    <td style={PTD}>{d.valor_gpt4o}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {result.pasos_siguientes?.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1.5px", marginBottom:8 }}>PLAN DE ACCIÓN PRIORITARIO</div>
              {result.pasos_siguientes.map((p, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"28px 1fr", gap:8, padding:"7px 10px", borderBottom:i < result.pasos_siguientes.length - 1 ? "1px solid #EEF2FB" : "none", pageBreakInside:"avoid" }}>
                  <div style={{ width:20, height:20, borderRadius:"50%", background:i===0?"#C0392B":i===1?"#D68910":"#2952A3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff" }}>{i + 1}</div>
                  <div style={{ fontSize:10, color:"#3D4A5C", lineHeight:1.5 }}>{p}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── INFORME FINAL ── */}
      <div style={{ ...pg, pageBreakInside:"avoid", breakInside:"avoid" }}>
        <CapaBanner>★ INFORME FINAL</CapaBanner>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, gap:12 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, color:"#1B3A8A", fontFamily:"Arial,sans-serif", margin:"0 0 2px" }}>{TIPOS.find(t => t.id === tipo)?.label} · {PRC_COMUNAS[comuna]?.meta?.nombre || comuna}</h2>
            <div style={{ fontSize:10, color:"#6B7A99" }}>{new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontSize:8, fontWeight:700, padding:"3px 12px", borderRadius:99, ...ec }}>{result.estado_global}</span>
          </div>
        </div>
        <p style={{ fontSize:11, color:"#3D4A5C", lineHeight:1.7, marginBottom:16 }}>{fixResumenGeneral(result.resumen_general, altas.length, tecnicas.length)}</p>
        {total > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:8, color:"#6B7A99", marginBottom:4 }}>
              <span>Progreso de revisión</span>
              <span>{resueltas} / {total} observaciones resueltas</span>
            </div>
            <div style={{ background:"#EEF2FB", borderRadius:99, height:4, overflow:"hidden" }}>
              <div style={{ width:`${total ? (resueltas / total) * 100 : 0}%`, height:"100%", borderRadius:99, background:"#1E8449" }} />
            </div>
          </div>
        )}
        {result.alertas_especiales?.filter(a => a?.trim()).length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#D68910", letterSpacing:"1.5px", marginBottom:6 }}>ALERTAS ESPECIALES</div>
            {result.alertas_especiales.filter(a => a?.trim()).map((a, i) => (
              <div key={i} style={{ background:"#FEF3CD", border:"1px solid #D68910", borderRadius:5, padding:"7px 10px", marginBottom:4, fontSize:10, color:"#7D5A00", lineHeight:1.5 }}>⚠ {a}</div>
            ))}
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1.5px", marginBottom:6 }}>RESUMEN DE VERIFICACIÓN</div>
          {[
            { label:"Normativa OGUC verificada", ok:true },
            { label:"Normativa LGUC verificada", ok:true },
            { label:tienePRC ? `PRC ${PRC_COMUNAS[comuna].meta.nombre} aplicado` : "PRC — comuna no registrada", ok:tienePRC },
            { label:totalRecintos > 0 ? `${totalRecintos} recinto${totalRecintos !== 1 ? "s" : ""} identificado${totalRecintos !== 1 ? "s" : ""}` : "Recintos — no detectados", ok:totalRecintos > 0 },
            { label:"Incumplimientos críticos", ok:altas.length === 0 },
          ].map(item => (
            <div key={item.label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:10, color:"#3D4A5C", marginBottom:4 }}>
              <span style={{ fontSize:11, flexShrink:0 }}>{item.ok ? "✅" : "⚠️"}</span>
              <span style={{ color:item.ok ? "#1E8449" : "#D68910" }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ background:"#EEF2FB", border:"1px solid #D1D9EE", borderRadius:6, padding:"10px 12px", fontSize:9, color:"#6B7A99", lineHeight:1.6 }}>
          ⚠ Análisis orientativo. No reemplaza la revisión oficial de la DOM. Consulte siempre el Plan Regulador Comunal y la DOM de su comuna.
        </div>
      </div>

    </div>
  );
}

// ── Componente ─────────────────────────────────────────────────────────────
export default function ArchiCheck() {
  const [archivos,   setArchivos]   = useState([]);
  const [tipo,       setTipo]       = useState("obra_nueva");
  const [comuna,     setComuna]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [progress,   setProgress]   = useState("");
  const [result,           setResult]           = useState(null);
  const [analysisTimestamp, setAnalysisTimestamp] = useState(null);
  const [error,      setError]      = useState("");
  const [expandido,  setExpandido]  = useState({});
  const [dragOver,   setDragOver]   = useState(false);
  const [modalDwg, setModalDwg] = useState(false);
  const [dwgBloqueado, setDwgBloqueado] = useState(false);
  const [preguntas, setPreguntas] = useState({ situacion: "", analizarSituacion: "", niveles: "" });
  const [obsStatus, setObsStatus] = useState({});
  const [sinTipo, setSinTipo] = useState(false);
  const [colabJson, setColabJson] = useState(null);
  const [colabPngs, setColabPngs] = useState([]);
  const [colabExpanded, setColabExpanded] = useState(false);
  // ── Revisión gráfica de geometría ──────────────────────────────────────
  const [colabCorrecciones, setColabCorrecciones] = useState(CORRECCIONES_VACIAS);
  const [revisionConfirmada, setRevisionConfirmada] = useState(false);
  const [colabJsonCorregido, setColabJsonCorregido] = useState(null);
  const [pngsRevisadosPorPagina, setPngsRevisadosPorPagina] = useState({});
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewModalStep, setReviewModalStep] = useState(0); // índice dentro de entriesConPng, no entry_idx directo
  const [reviewTool, setReviewTool] = useState("seleccionar");
  const [reviewSelectedId, setReviewSelectedId] = useState(null);
  const [reviewSelectedTipo, setReviewSelectedTipo] = useState(null); // "recinto" | "elemento" | null
  const [reviewLinePoints, setReviewLinePoints] = useState([]);
  // Reactivado 2026-08-11 (paso 2, después de Cortar) — ids de recintos acumulados con la
  // herramienta "Fusionar recintos" antes de confirmar. No reusa reviewSelectedId (que es un solo
  // id) porque una fusión necesita 2+ a la vez, acumulados con clics sueltos (no un par como las
  // herramientas de 2 clics) — mismo espíritu que reviewLinePoints pero sobre recintos, no puntos.
  const [reviewFusionSet, setReviewFusionSet] = useState([]);
  // entry_idx (no "pagina") identifica cada entrada de colabJson.paginas[] de forma única — una
  // misma página física puede tener 2+ entradas/crops (ej. "pag2-1"/"pag2-2") con el mismo número
  // de pagina, por eso no se puede usar pagina como clave. La "página activa" del modal se deriva
  // del índice de paso (reviewModalStep), no es un estado propio — una sola fuente de verdad.
  const entriesConPng = colabPngs.filter(p => p.entryIdx != null).map(p => p.entryIdx);
  const reviewActiveEntry = entriesConPng[reviewModalStep] ?? null;
  const [fichaProyecto, setFichaProyecto] = useState({ zonaId: "", superficieTerreno: "", cosProyectado: "", ccProyectado: "", alturaM: "", pisosProyectados: "", anchoCalleFrentera: "" });
  const [fichaExpanded, setFichaExpanded] = useState(false);
  const [verificadorResult, setVerificadorResult] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeEtapa, setActiveEtapa] = useState("e1");
  const [activeFloor, setActiveFloor] = useState(0);
  const [printing, setPrinting] = useState(false);
  const inputRef = useRef();
  const colabInputRef = useRef();
  const colabPngInputRef = useRef();
  const printRef = useRef();

  function resetApp() {
    setResult(null);
    setArchivos([]);
    setColabJson(null);
    setColabPngs(prev => { for (const p of prev) if (p?.objectUrl) URL.revokeObjectURL(p.objectUrl); return []; });
    setColabExpanded(false);
    setVerificadorResult(null);
    setObsStatus({});
    setError("");
    setExpandido({});
    setActiveEtapa("e1");
    resetRevisionGeometrica();
  }

  function exportPDF() {
    if (!printRef.current) return;

    const slug = TIPOS.find(t => t.id === tipo)?.label?.replace(/\s+/g, "-").toLowerCase() || "informe";
    const ts = analysisTimestamp || new Date();
    const pad = n => n.toString().padStart(2, "0");
    const tsStr = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}${pad(ts.getMinutes())}`;
    const titulo = `ArchiCheck — ${slug} — ${tsStr}`;

    // Abre el informe en una nueva pestaña y dispara window.print() automáticamente.
    // Usa el renderer nativo del browser — sin html2canvas, sin canvas blancos.
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${titulo}</title>
<style>
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;padding:0;font-family:Arial,sans-serif;background:#fff;}
@page{margin:8mm 0;size:A4 portrait;}
.obs-no-break{page-break-inside:avoid;break-inside:avoid;}
table{border-collapse:collapse;width:100%;}
</style>
<script>window.onload=function(){setTimeout(window.print,400);}<\/script>
</head><body>
${printRef.current.innerHTML}
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (!win) alert("Permite ventanas emergentes en este sitio para exportar el PDF.");
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    // Descarga los PNG corregidos como archivos separados, mismo timestamp que el PDF — el
    // informe (arriba) no lleva ningún dibujo nuevo, esto es aparte, no se toca printRef/PrintReport.
    const tsFile = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
    descargarPngsRevisados(pngsRevisadosPorPagina, tsFile);
  }

  // Exporta el par (PNG limpio, muros_geo corregido) para el dataset de fine-tuning propio de
  // MLSTRUCT-FP — deshabilitado en la UI si el arquitecto nunca confirmó la revisión gráfica
  // (colabJsonCorregido null), a propósito: exportar muros sin corregir como si fueran dato
  // validado contaminaría el dataset con el mismo ruido de extracción que se busca corregir.
  function exportDatasetMuros() {
    if (!colabJsonCorregido) return;
    const ts = analysisTimestamp || new Date();
    const pad = n => n.toString().padStart(2, "0");
    const tsFile = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}`;
    descargarDatasetMuros(colabJson, colabJsonCorregido, colabCorrecciones, colabPngs, tsFile);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Manejo de archivos ─────────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    const tieneDwg = Array.from(files).some(
      f => f.name.toLowerCase().endsWith(".dwg") ||
           f.name.toLowerCase().endsWith(".dxf")
    );
    if (tieneDwg) {
      setModalDwg(true);
      setDwgBloqueado(true);
      return;
    }
    const validos = Array.from(files).filter(f =>
      f.type === "application/pdf" ||
      f.type.startsWith("image/")
    );
    const procesados = await Promise.all(validos.map(async (f) => {
      const pdfImages = f.type === "application/pdf" ? await pdfPagesToBase64(f) : null;
      return {
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
        isImage: f.type.startsWith("image/"),
        pdfImages,
        paginasSeleccionadas: pdfImages?.map(img => img.page) ?? [],
        base64: f.type.startsWith("image/") ? await compressImage(f) : null,
        tipoDoc: "",
      };
    }));
    setArchivos(prev => [...prev, ...procesados]);
  }, []);

  const removeFile   = (i) => setArchivos(prev => prev.filter((_, idx) => idx !== i));
  const setTipoDoc   = (i, v) => setArchivos(prev => prev.map((f, idx) => idx === i ? { ...f, tipoDoc: v } : f));
  const togglePagina = (fileIdx, pagina) => setArchivos(prev => prev.map((f, idx) => {
    if (idx !== fileIdx) return f;
    const sel = f.paginasSeleccionadas.includes(pagina)
      ? f.paginasSeleccionadas.filter(p => p !== pagina)
      : [...f.paginasSeleccionadas, pagina].sort((a, b) => a - b);
    return { ...f, paginasSeleccionadas: sel };
  }));
  const toggle = (k) => setExpandido(prev => ({ ...prev, [k]: !prev[k] }));

  const setObsAction = (key, action) => {
    setObsStatus(prev => {
      const newStatus = prev[key]?.status === action ? null : action;
      if (newStatus) setToast(newStatus);
      return { ...prev, [key]: { ...prev[key], status: newStatus } };
    });
  };
  const setObsComment = (key, comment) => {
    setObsStatus(prev => ({ ...prev, [key]: { ...prev[key], comment } }));
  };

  function resetRevisionGeometrica() {
    setColabCorrecciones(CORRECCIONES_VACIAS);
    setRevisionConfirmada(false);
    setColabJsonCorregido(null);
    setPngsRevisadosPorPagina({});
    setReviewModalOpen(false);
    setReviewModalStep(0);
    setReviewTool("seleccionar");
    setReviewSelectedId(null);
    setReviewSelectedTipo(null);
    setReviewLinePoints([]);
  }

  async function handleColabJson(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text.replace(/^﻿/, ""));
      if (!json.paginas && !json.tabla_cruzada) {
        setError("El JSON no parece ser un archivo de Colab válido.");
        return;
      }
      setColabJson(json);
      setColabExpanded(true);
      setError("");
      resetRevisionGeometrica();
    } catch (e) {
      setError("No se pudo leer el JSON de Colab: " + e.message);
    }
  }

  // Lee un PNG crudo SIN comprimir (URL.createObjectURL) para el canvas de revisión — sus
  // píxeles deben calzar 1:1 con el bbox que mide Colab. compressImage() se sigue usando aparte,
  // solo para la copia que efectivamente viaja a la API (límite de 5MB de Anthropic/OpenAI).
  function leerPngCrudo(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ objectUrl, srcWidth: img.naturalWidth, srcHeight: img.naturalHeight });
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  async function handleColabPngs(files) {
    if (!files?.length) return;
    const nuevos = await Promise.all(Array.from(files).map(async (f) => {
      const { objectUrl, srcWidth, srcHeight } = await leerPngCrudo(f);
      return { name: f.name, base64: await compressImage(f), objectUrl, srcWidth, srcHeight, entryIdx: null };
    }));
    setColabPngs(prev => [...prev, ...nuevos]);
    setColabExpanded(true);
    resetRevisionGeometrica();
  }

  function removeColabPng(i) {
    setColabPngs(prev => {
      const png = prev[i];
      if (png?.objectUrl) URL.revokeObjectURL(png.objectUrl);
      return prev.filter((_, idx) => idx !== i);
    });
    resetRevisionGeometrica();
  }

  function asignarPaginaColabPng(i, entryIdx) {
    setColabPngs(prev => prev.map((p, idx) => idx === i ? { ...p, entryIdx } : p));
    resetRevisionGeometrica();
  }

  // ── Handlers de la revisión gráfica de geometría ───────────────────────
  function aplicarCorreccionRecinto(id, patch) {
    setColabCorrecciones(prev => ({ ...prev, recintosEditados: { ...prev.recintosEditados, [id]: { ...prev.recintosEditados[id], ...patch } } }));
  }

  function eliminarRecinto(id) {
    setColabCorrecciones(prev => ({ ...prev, recintosEliminados: [...prev.recintosEliminados, id] }));
    setReviewSelectedId(null); setReviewSelectedTipo(null);
  }

  function aplicarCorreccionElemento(item, patch) {
    setColabCorrecciones(prev => item._nuevo
      ? { ...prev, elementosPuntualesNuevos: prev.elementosPuntualesNuevos.map(e => e.id === item.id ? { ...e, ...patch } : e) }
      : { ...prev, elementosPuntualesEditados: { ...prev.elementosPuntualesEditados, [item.id]: { ...prev.elementosPuntualesEditados[item.id], ...patch } } });
  }

  function eliminarElemento(item, motivo) {
    setColabCorrecciones(prev => {
      const motivosEliminacion = motivo?.trim()
        ? { ...prev.motivosEliminacion, [item.id]: motivo.trim() }
        : prev.motivosEliminacion;
      return item._nuevo
        ? { ...prev, elementosPuntualesNuevos: prev.elementosPuntualesNuevos.filter(e => e.id !== item.id), motivosEliminacion }
        : { ...prev, elementosPuntualesEliminados: [...prev.elementosPuntualesEliminados, item.id], motivosEliminacion };
    });
    setReviewSelectedId(null); setReviewSelectedTipo(null);
  }

  function agregarElementoNuevo(categoria, entryIdx, p1, p2, mpp, imagenWPx, imagenHPx) {
    const calc = calcularElementoDesdeLinea(p1, p2, mpp, imagenWPx, imagenHPx);
    setColabCorrecciones(prev => {
      const n = prev.elementosPuntualesNuevos.filter(e => e.categoria === categoria).length + 1;
      const id = `${categoria[0].toUpperCase()}-A${n}`;
      const nuevo = { id, categoria, entryIdx, ubicacion_o_recinto: "", sentido_apertura: "no_determinado", ...calc, _nuevo: true };
      return { ...prev, elementosPuntualesNuevos: [...prev.elementosPuntualesNuevos, nuevo] };
    });
  }

  function moverElemento(item, pt, imagenWPx, imagenHPx) {
    const iw = imagenWPx || 1, ih = imagenHPx || 1;
    const cx_relativo = pt.x / iw, cy_relativo = pt.y / ih;
    const patch = { cx_relativo, cy_relativo };
    // Si el elemento ya tiene geometría real (línea/rectángulo), trasladar ambos puntos por el
    // mismo delta en vez de solo mover el centroide — preserva forma/tamaño/orientación.
    if (item.p1_relativo && item.p2_relativo) {
      const dx = cx_relativo - (item.cx_relativo ?? cx_relativo);
      const dy = cy_relativo - (item.cy_relativo ?? cy_relativo);
      patch.p1_relativo = { x: item.p1_relativo.x + dx, y: item.p1_relativo.y + dy };
      patch.p2_relativo = { x: item.p2_relativo.x + dx, y: item.p2_relativo.y + dy };
    }
    aplicarCorreccionElemento(item, patch);
    setReviewTool("seleccionar");
  }

  // Limpia cualquier trazo de muro (u otro punto de línea) o selección de fusión a medio marcar
  // al cambiar de herramienta — evita que un intento abandonado se mezcle con el siguiente.
  function handleCambiarHerramienta(t) {
    setReviewTool(t);
    setReviewLinePoints([]);
    setReviewFusionSet([]);
  }

  function handleSeleccionarEnCanvas(id, tipoSel) {
    setReviewSelectedId(id);
    setReviewSelectedTipo(tipoSel);
  }

  // Reactivado 2026-08-11 (paso 2) — acumula/quita ids de recinto del set de fusión. Toggle (no
  // solo agregar) para poder corregir un clic accidental sin tener que cancelar todo el intento.
  function handleToggleFusion(id) {
    setReviewFusionSet(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleConfirmarFusion() {
    if (reviewFusionSet.length < 2) return;
    const mediciones = getMedicionesPorPagina(colabJson, colabCorrecciones, reviewActiveEntry);
    const recintos = reviewFusionSet.map(id => mediciones.find(r => r.id === id)).filter(Boolean);
    if (recintos.length < 2) return; // alguno ya no existe (ej. eliminado entretanto) — no fusionar a medias
    const { bbox, area_m2 } = ejecutarFusion(recintos);
    // nombre y tipo vacíos a propósito — a diferencia de Cortar (un solo recinto original, mismo
    // tipo en ambos pedazos), una fusión junta 2+ recintos que pueden ser de tipos distintos (el
    // caso de prueba real: "Terraza" + "Cocina") — no hay un tipo/nombre correcto para adivinar,
    // el arquitecto lo confirma a mano vía "Seleccionar" + PanelRetag.
    // 2026-08-17: corregido bug real encontrado probando en vivo -- el campo real es "tipo", no
    // "uso". Con el nombre equivocado, fusion.resultado nunca tocaba el campo tipo de verdad, y
    // el spread {...r, ...fusion.resultado} en getMedicionesPorPagina dejaba pasar el tipo
    // original del primer recinto sin querer (ej. el resultado fusionado seguia mostrando
    // "terraza" en el campo Tipo, en vez de quedar vacio como estaba pensado).
    const resultado = { id: recintos[0].id, bbox, area_m2: Math.round(area_m2 * 100) / 100, nombre: "", tipo: "" };
    setColabCorrecciones(prev => ({ ...prev, fusiones: [...prev.fusiones, { entryIdx: reviewActiveEntry, ids: reviewFusionSet, resultado }] }));
    setReviewFusionSet([]);
  }

  function handleMoverDestino(pt) {
    const pag = colabJson?.paginas?.find(p => p.entry_idx === reviewActiveEntry);
    if (!pag || !reviewSelectedId) return;
    const elementos = getElementosPuntualesConPosicion(colabJson, colabCorrecciones, reviewActiveEntry);
    const item = elementos.find(e => e.id === reviewSelectedId);
    if (item) moverElemento(item, pt, pag.imagen_w_px, pag.imagen_h_px);
  }

  // Reactivado 2026-08-11 (Cortar) a pedido explícito del usuario — ver LeyendaHerramientas y
  // roadmap. Excluir área sigue sin reactivar (paso siguiente, no este). La lógica de datos
  // (ejecutarCorte y su reintegración en getMedicionesPorPagina/construirColabJsonCorregido)
  // nunca se tocó desde que se apagó — solo faltaba esta rama para poder dispararla.
  function ejecutarAccionDosClicks(p1, p2) {
    const pag = colabJson?.paginas?.find(p => p.entry_idx === reviewActiveEntry);
    if (!pag) return;
    const mpp = pag.mpp || 0;

    if (CATEGORIAS_ELEMENTO.some(c => c.id === reviewTool)) {
      agregarElementoNuevo(reviewTool, reviewActiveEntry, p1, p2, mpp, pag.imagen_w_px, pag.imagen_h_px);
      return;
    }
    if (reviewTool === "cortar") {
      // Requiere un recinto ya seleccionado con la herramienta "Seleccionar" ANTES de cambiar a
      // "Cortar" — reviewSelectedId no se limpia al cambiar de herramienta (ver
      // handleCambiarHerramienta), así que sigue apuntando al recinto elegido. Si no hay
      // selección, no se hace nada en silencio — LeyendaHerramientas avisa con texto que hace
      // falta seleccionar primero (ver hint ahí), este early-return es el mismo caso ya cubierto.
      if (reviewSelectedTipo !== "recinto" || !reviewSelectedId) return;
      const mediciones = getMedicionesPorPagina(colabJson, colabCorrecciones, reviewActiveEntry);
      const recinto = mediciones.find(r => r.id === reviewSelectedId);
      if (!recinto?.bbox) return;
      const [bboxA, bboxB] = ejecutarCorte(recinto.bbox, p1, p2);
      // nombre queda vacío a propósito — son dos recintos nuevos que el arquitecto todavía no
      // confirmó, se renombran a mano vía "Seleccionar" + PanelRetag después del corte (mismo
      // patrón que cualquier elemento sin_nombre_confirmar). tipo SÍ se hereda del recinto
      // original (a diferencia de Fusionar) -- un corte parte UN recinto en dos, ambos pedazos
      // siguen siendo del mismo tipo de espacio (ej. cortar un "baño" da dos trozos de "baño").
      // 2026-08-17: corregido bug real encontrado probando en vivo -- el campo real del objeto
      // recinto es "tipo" (confirmado en el JSON de Colab, ej. "tipo": "terraza"), no "uso" como
      // se habia asumido sin verificar -- con el nombre de campo equivocado, esto nunca heredaba
      // nada de verdad (recinto.uso siempre es undefined).
      const resultado = [bboxA, bboxB].map((bbox, i) => ({
        id: `${recinto.id}-${i === 0 ? "A" : "B"}`,
        bbox,
        area_m2: Math.round(bbox.w * bbox.h * mpp * mpp * 100) / 100,
        nombre: "",
        tipo: recinto.tipo || "",
      }));
      setColabCorrecciones(prev => ({ ...prev, cortes: [...prev.cortes, { entryIdx: reviewActiveEntry, origenId: recinto.id, resultado }] }));
      setReviewSelectedId(null); setReviewSelectedTipo(null);
      return;
    }
    if (reviewTool === "excluir_area") {
      // Reactivado 2026-08-17 (paso 3, ultima de las 3 herramientas de recinto) — mismo
      // requisito que Cortar: recinto ya seleccionado antes de cambiar a esta herramienta.
      // A diferencia de Cortar/Fusionar, el recinto NO se reemplaza -- sigue existiendo, solo se
      // le resta el area del rectangulo marcado (getMedicionesPorPagina ya hace la resta real via
      // calcularAreaExcluida). Por eso, a proposito, NO se limpia la seleccion al terminar: el
      // arquitecto puede marcar varias zonas seguidas (ej. 2 muebles distintos) sobre el mismo
      // recinto sin tener que volver a "Seleccionar" cada vez.
      if (reviewSelectedTipo !== "recinto" || !reviewSelectedId) return;
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
      if (w < 1 || h < 1) return; // rectangulo degenerado (doble clic casi en el mismo punto)
      const bbox = { x, y, w, h };
      setColabCorrecciones(prev => ({ ...prev, areasExcluidas: [...prev.areasExcluidas, { entryIdx: reviewActiveEntry, recintoId: reviewSelectedId, bbox }] }));
    }
  }

  // IMPORTANTE: ejecutarAccionDosClicks (y todo lo que dispara: agregar/cortar/excluir) es un
  // efecto secundario real (llama a setColabCorrecciones). React StrictMode invoca el cuerpo de
  // los actualizadores funcionales de setState DOS VECES en desarrollo para detectar impurezas —
  // si ejecutarAccionDosClicks se llamaba desde ADENTRO de un `setReviewLinePoints(prev => ...)`,
  // se ejecutaba dos veces por cada segundo clic real (bug real encontrado en pruebas: una puerta
  // marcada con un solo par de clics quedaba duplicada). Por eso acá NO se anida el efecto
  // secundario dentro del actualizador — se lee reviewLinePoints del closure normal (ya
  // actualizado al momento del clic, cada clic es un evento discreto) y se llama aparte.
  function handleReviewLinePoint(pt) {
    // Muro: sigue acumulando trazos indefinidamente — se confirma con un botón aparte
    // (handleConfirmarMuro), no se dispara solo al segundo clic como el resto. Acumular en el
    // updater acá es seguro porque no tiene efectos secundarios (solo agrega al array).
    if (reviewTool === "muro") {
      setReviewLinePoints(prev => [...prev, pt]);
      return;
    }
    if (reviewLinePoints.length === 0) {
      setReviewLinePoints([pt]);
      return;
    }
    const p1 = reviewLinePoints[0];
    setReviewLinePoints([]);
    ejecutarAccionDosClicks(p1, pt);
  }

  function handleConfirmarMuro() {
    if (reviewLinePoints.length < 2) return;
    const pag = colabJson?.paginas?.find(p => p.entry_idx === reviewActiveEntry);
    const iw = pag?.imagen_w_px || 1, ih = pag?.imagen_h_px || 1, mpp = pag?.mpp || 0;
    let largo = 0;
    for (let i = 1; i < reviewLinePoints.length; i++) {
      largo += Math.hypot(reviewLinePoints[i].x - reviewLinePoints[i - 1].x, reviewLinePoints[i].y - reviewLinePoints[i - 1].y);
    }
    const xs = reviewLinePoints.map(p => p.x), ys = reviewLinePoints.map(p => p.y);
    const cx_relativo = ((Math.min(...xs) + Math.max(...xs)) / 2) / iw;
    const cy_relativo = ((Math.min(...ys) + Math.max(...ys)) / 2) / ih;
    // Segmentos consecutivos, no una cadena de puntos — mismo shape que usan los muros que
    // exporta Colab (pag.muros_geo), para que dibujo/hit-test tengan un solo camino de código
    // sin importar el origen (ver CATEGORIAS_ELEMENTO).
    const segmentos = [];
    for (let i = 1; i < reviewLinePoints.length; i++) {
      segmentos.push({ p1: reviewLinePoints[i - 1], p2: reviewLinePoints[i] });
    }
    setColabCorrecciones(prev => {
      const n = prev.elementosPuntualesNuevos.filter(e => e.categoria === "muro").length + 1;
      const id = `MU-A${n}`;
      const nuevo = { id, categoria: "muro", entryIdx: reviewActiveEntry, segmentos, largo_m: Math.round(largo * mpp * 100) / 100, cx_relativo, cy_relativo, ubicacion_o_recinto: "", _nuevo: true };
      return { ...prev, elementosPuntualesNuevos: [...prev.elementosPuntualesNuevos, nuevo] };
    });
    setReviewLinePoints([]);
    setReviewTool("seleccionar");
  }

  async function handleConfirmarRevision() {
    const corregido = construirColabJsonCorregido(colabJson, colabCorrecciones);
    setColabJsonCorregido(corregido);

    const entradas = await Promise.all((colabJson?.paginas || []).map(async (pag) => {
      const png = colabPngs.find(p => p.entryIdx === pag.entry_idx);
      if (!png) return null;
      const mediciones = getMedicionesPorPagina(colabJson, colabCorrecciones, pag.entry_idx);
      const elementos = getElementosPuntualesConPosicion(colabJson, colabCorrecciones, pag.entry_idx);
      const dataUrl = await dibujarPngRevisado(png, mediciones, elementos, pag.imagen_w_px, pag.imagen_h_px, pag.mpp);
      // Clave por entry_idx (único) — pag.pagina puede repetirse entre entradas (crops distintos
      // de una misma página física), usarlo como clave pisaría un PNG con otro.
      return dataUrl ? [pag.entry_idx, { dataUrl, pagina: pag.pagina, fnameTag: pag.fname_tag }] : null;
    }));
    setPngsRevisadosPorPagina(Object.fromEntries(entradas.filter(Boolean)));

    setRevisionConfirmada(true);
    setToast("Geometría confirmada");
  }

  async function handleFinalizarModal() {
    await handleConfirmarRevision();
    setReviewModalOpen(false);
  }

  // ── Análisis ───────────────────────────────────────────────────────────
  async function analizar() {
    if (!archivos.length) return;
    const faltanTipo = archivos.some(f => !f.tipoDoc);
    if (faltanTipo) { setSinTipo(true); setError("Asigna el tipo de documento a cada archivo antes de analizar."); return; }
    setSinTipo(false);
    if (!colabJson) { setError("Sube el JSON de análisis Colab antes de analizar."); return; }
    if (!colabPngs.length) { setError("Sube al menos un PNG de segmentación Colab antes de analizar."); return; }
    setLoading(true); setError(""); setResult(null); setObsStatus({}); setActiveEtapa("e1");
    try {
      // Construir content (imágenes primero, luego el prompt)
      // ── Construir imágenes (compartidas por capa1 y capa2) ────────────────
      setProgress("Convirtiendo PDFs a imágenes...");
      const imageContent = [];
      for (const f of archivos) {
        if (f.isImage && f.base64) {
          imageContent.push({ type: "image", source: { type: "base64", media_type: f.type, data: f.base64 } });
          imageContent.push({ type: "text", text: `[Imagen: "${f.name}" — ${f.tipoDoc || "plano"}]` });
        }
        if (f.pdfImages?.length) {
          const pagSel = f.paginasSeleccionadas?.length ? f.paginasSeleccionadas : f.pdfImages.map(img => img.page);
          setProgress(`Renderizando ${f.name} (${pagSel.length} página${pagSel.length !== 1 ? "s" : ""})...`);
          const fullRes = await renderPdfPagesFullRes(f.file, pagSel);
          const totalPaginas = f.pdfImages[0].total;
          for (const img of fullRes) {
            imageContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
            imageContent.push({ type: "text", text: `[PDF: "${f.name}" — página ${img.page}/${totalPaginas} — ${f.tipoDoc || "plano"}]` });
          }
        }
      }
      // Manda el PNG ANOTADO (con las marcas de puertas/ventanas/muros/escaleras/rampas que el
      // arquitecto confirmó/agregó/eliminó en la revisión gráfica) en vez del PNG limpio, cuando
      // esté disponible — antes se mandaba siempre el limpio, así que Claude nunca veía ninguna
      // corrección hecha a mano (ni su posición, ni su recinto): la corrección quedaba solo en el
      // JSON como un conteo agregado, sin geometría. pngsRevisadosPorPagina ya existe y se genera
      // en handleConfirmarRevision(), que es obligatorio antes de habilitar "Analizar expediente"
      // — por eso debería estar poblado para cada página siempre; el fallback al PNG limpio es
      // solo por robustez, no un camino esperado.
      for (const png of colabPngs) {
        const revisado = pngsRevisadosPorPagina?.[png.entryIdx];
        if (revisado?.dataUrl) {
          const base64Anotado = revisado.dataUrl.split(",")[1] || "";
          imageContent.push({ type: "image", source: { type: "base64", media_type: "image/png", data: base64Anotado } });
          imageContent.push({ type: "text", text: `[COLAB PNG ANOTADO: "${png.name}" — segmentación OpenCV de recintos, áreas y anchos medidos desde píxeles reales, CON las puertas/ventanas/muros/escaleras/rampas ya revisadas, corregidas o agregadas a mano por el arquitecto marcadas directamente sobre el plano (etiqueta = id del elemento, ej. "V-A1")]` });
        } else {
          imageContent.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: png.base64 } });
          imageContent.push({ type: "text", text: `[COLAB PNG: "${png.name}" — segmentación OpenCV de recintos, áreas y anchos medidos desde píxeles reales]` });
        }
      }

      // Usa el JSON de Colab ya corregido por el arquitecto en la revisión gráfica (si se confirmó)
      // — las imágenes de arriba no cambian, solo el texto que se deriva de este objeto.
      const colabJsonEfectivo = colabJsonCorregido || colabJson;

      // ── Helpers ───────────────────────────────────────────────────────────
      function fetchWithTimeout(url, opts, ms = 270_000) {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), ms);
        return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(tid));
      }
      const H = { "Content-Type": "application/json" };
      const mkBody = (m, c, ragQuery) => JSON.stringify({
        messages: [{ role: "user", content: c }],
        modelo: m,
        ...(ragQuery ? { ragQuery } : {}),
      });
      const parse = s => {
        if (s.status !== "fulfilled") return null;
        let raw = s.value.replace(/```json|```/g, "").trim();
        // Si el modelo antepuso texto antes del JSON, busca el primer {
        const idx = raw.indexOf("{");
        if (idx > 0) raw = raw.slice(idx);
        return repairAndParse(raw);
      };

      // ── FASE 1: Levantamiento geométrico (Claude + GPT-4o en paralelo) ────
      setProgress("Fase 1/2 — Levantamiento geométrico (Claude + GPT-4o)...");
      const contentC1 = [...imageContent, { type: "text", text: buildPromptCapa1(tipo, comuna, archivos, preguntas, colabJsonEfectivo) }];

      const [rC1, rG1] = await Promise.all([
        fetchWithTimeout(WORKER_URL, { method: "POST", headers: H, body: mkBody("claude", contentC1) }),
        fetchWithTimeout(WORKER_URL, { method: "POST", headers: H, body: mkBody("gpt4o",  contentC1) }),
      ]);
      const [sC1, sG1] = await Promise.allSettled([readModelStream(rC1), readModelStream(rG1)]);
      const pC1 = parse(sC1), pG1 = parse(sG1);
      const isComplete = p => p && !String(p.resumen_general || "").startsWith("⚠");
      if (!isComplete(pC1) && !isComplete(pG1))
        throw new Error(
          (!pC1 && !pG1)
            ? ((sC1.reason || sG1.reason)?.message || "Error en Fase 1 — sin respuesta de ningún modelo")
            : "Fase 1 — respuesta incompleta en ambos modelos. Reintenta el análisis."
        );
      const cap1 = (isComplete(pC1) && isComplete(pG1)) ? mergeResults(pC1, pG1)
                 : isComplete(pC1) ? pC1 : pG1;

      // ── FASE 2: Evaluación normativa completa con contexto de Fase 1 ──────
      setProgress("Fase 2/2 — Evaluación normativa completa (Claude + GPT-4o)...");
      const contentC2 = [...imageContent, { type: "text", text: buildPromptCapa2(tipo, comuna, archivos, preguntas, colabJsonEfectivo, cap1) }];
      const tipoLabel2 = TIPOS.find(t => t.id === tipo)?.label || tipo;
      const comunaNombre2 = PRC_COMUNAS[comuna]?.meta?.nombre || comuna || "";
      const ragQ = `${tipoLabel2} ${comunaNombre2} normativa OGUC LGUC accesibilidad circulaciones iluminación superficies evacuación urbanística`;

      const [rC2, rG2] = await Promise.all([
        fetchWithTimeout(WORKER_URL, { method: "POST", headers: H, body: mkBody("claude", contentC2, ragQ) }),
        fetchWithTimeout(WORKER_URL, { method: "POST", headers: H, body: mkBody("gpt4o",  contentC2, ragQ) }),
      ]);
      setProgress("Consolidando análisis...");
      const [sC2, sG2] = await Promise.allSettled([readModelStream(rC2), readModelStream(rG2)]);
      const pC2 = parse(sC2), pG2 = parse(sG2);

      if (!isComplete(pC2) && !isComplete(pG2))
        throw new Error(
          (!pC2 && !pG2)
            ? ((sC2.reason || sG2.reason)?.message || "Error en Fase 2 — sin respuesta de ningún modelo")
            : "Fase 2 — respuesta incompleta en ambos modelos. Reintenta el análisis."
        );

      const cap2 = (isComplete(pC2) && isComplete(pG2)) ? mergeResults(pC2, pG2)
                 : isComplete(pC2) ? pC2 : pG2;

      // ── Resultado final ───────────────────────────────────────────────────
      const merged = sanitizeDS50({
        resumen_general:      cap2.resumen_general       || "",
        estado_global:        cap2.estado_global         || "OBSERVADO",
        tabla_observaciones:  cap2.tabla_observaciones   || [],
        alertas_especiales:   cap2.alertas_especiales    || [],
        capa2:                cap2.capa2                 || {},
        analisis_por_archivo: cap1.analisis_por_archivo  || [],
        pasos_siguientes:     cap2.pasos_siguientes      || [],
        capa1:                cap1.capa1                 || {},
        // Discrepancias reales entre Claude y GPT-4o (mismo recinto/elemento, veredicto distinto,
        // o detectado por un solo modelo) — cap1 las junta en Fase 1 (recintos_por_nivel), cap2 en
        // Fase 2 (las 4 tablas normativas). Ausente cuando solo un modelo respondió completo (no
        // hay nada que comparar). Ver mergeResults/Convenciones_CAD.md D.11.
        discrepancias_ensamble: [...(cap1.discrepancias_ensamble || []), ...(cap2.discrepancias_ensamble || [])],
      });

      const sinDatos = !merged.analisis_por_archivo?.length
        && !Object.keys(merged.capa1).length
        && !Object.keys(merged.capa2).length
        && !merged.alertas_especiales?.length;
      if (sinDatos) throw new Error("La respuesta llegó vacía o cortada. Reduce el número de páginas o archivos e intenta de nuevo.");

      // ── Verificación determinista (sincrónica, sin varianza) ────────────────
      if (fichaProyecto.zonaId) {
        const proj = {
          superficieTerreno:  fichaProyecto.superficieTerreno  ? Number(fichaProyecto.superficieTerreno)  : null,
          cosProyectado:      fichaProyecto.cosProyectado      ? Number(fichaProyecto.cosProyectado)      : null,
          ccProyectado:       fichaProyecto.ccProyectado       ? Number(fichaProyecto.ccProyectado)       : null,
          alturaM:            fichaProyecto.alturaM            ? Number(fichaProyecto.alturaM)            : null,
          pisosProyectados:   fichaProyecto.pisosProyectados   ? Number(fichaProyecto.pisosProyectados)   : null,
          anchoCalleFrentera: fichaProyecto.anchoCalleFrentera ? Number(fichaProyecto.anchoCalleFrentera) : null,
          tiposProyecto: [tipo],
        };
        setVerificadorResult(verificarProyecto(proj, fichaProyecto.zonaId, comuna));
      }

      // ── Post-procesado: parchar datos desde Colab (usa el JSON ya corregido por el arquitecto) ──
      if (colabJsonEfectivo) {
        // Fix 1: cantidades en vectorización desde el resumen semántico de Colab
        // (Claude Vision, vía analisis_semantico.elementos_detectados consolidado
        // en resumen_global -- el intento previo con Grounding DINO + SAM 2 se
        // sacó del notebook el 2026-08-09, confirmado ~0% recall en planos CAD)
        const rg = colabJsonEfectivo.resumen_global || {};
        const conteoColabMap = {
          puerta:   rg.puertas_detectadas   ?? 0,
          ventana:  rg.ventanas_detectadas  ?? 0,
          escalera: rg.escaleras_detectadas ?? 0,
          rampa:    rg.rampas_detectadas    ?? 0,
        };
        if (merged.capa1?.vectorizacion?.elementos) {
          for (const el of merged.capa1.vectorizacion.elementos) {
            const tipo = (el.tipo || "").toLowerCase();
            for (const [key, cnt] of Object.entries(conteoColabMap)) {
              if (cnt > 0 && tipo.includes(key)) { el.cantidad = cnt; break; }
            }
          }
        }
        // Fix 2: superficie_m2 en reconocimiento desde mediciones_geometricas Colab
        if (colabJsonEfectivo.paginas && merged.capa1?.reconocimiento?.recintos_por_nivel) {
          const colabRecs = colabJsonEfectivo.paginas.flatMap(p =>
            (p.mediciones_geometricas || []).filter(r => r.nombre && !r.nombre.startsWith("Espacio E"))
          );
          const norm = s => s.toLowerCase()
            .replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i")
            .replace(/[óòö]/g,"o").replace(/[úùü]/g,"u").replace(/[^a-z0-9]/g,"");
          for (const nivel of (merged.capa1.reconocimiento.recintos_por_nivel || [])) {
            for (const r of (nivel.recintos || [])) {
              if (r.superficie_m2 != null) continue;
              const rn = norm(r.nombre);
              if (rn.length < 4) continue;
              const match = colabRecs.find(cr => {
                const cn = norm(cr.nombre);
                return cn === rn || (cn.length > 4 && cn.includes(rn)) || (rn.length > 4 && rn.includes(cn));
              });
              if (match) { r.superficie_m2 = match.area_m2; r._from_colab = true; }
            }
          }
        }
        // Fix 3: inyectar _colab_id en recintos y elementos del informe
        const colabAllElems = colabJsonEfectivo.paginas.flatMap(p => p.mediciones_geometricas || []);
        const normId = s => s.toLowerCase()
          .replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i")
          .replace(/[óòö]/g,"o").replace(/[úùü]/g,"u").replace(/[^a-z0-9]/g,"");
        const findColabId = (nombre) => {
          if (!nombre) return null;
          const rn = normId(nombre);
          if (rn.length < 3) return null;
          const m = colabAllElems.find(e => {
            const cn = normId(e.nombre);
            return cn === rn || (cn.length > 4 && cn.includes(rn)) || (rn.length > 4 && rn.includes(cn));
          });
          return m?.id || null;
        };
        for (const nivel of (merged.capa1?.reconocimiento?.recintos_por_nivel || []))
          for (const r of (nivel.recintos || []))
            if (!r._colab_id) r._colab_id = findColabId(r.nombre);
        for (const r of (merged.capa2?.circulaciones?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.elemento);
        for (const r of (merged.capa2?.iluminacion_ventilacion?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.recinto);
        for (const nivel of (merged.capa2?.recintos_superficies?.por_nivel || []))
          for (const r of (nivel.recintos || []))
            if (!r._colab_id) r._colab_id = findColabId(r.nombre);
      }
      assignObsCodes(merged);
      setAnalysisTimestamp(new Date());
      setResult(merged);

    } catch (e) {
      setError("Error al analizar: " + e.message);
    } finally {
      setLoading(false); setProgress("");
    }
  }

  const ec = globalStyle(result?.estado_global);

  // ── Instrucciones DWG ──────────────────────────────────────────────────
  const InstruccionesDwg = () => (
    <div style={{
      background: "#EEF2FB",
      border: "1px solid #4A72C4",
      borderRadius: 10,
      padding: "20px 24px",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>📐</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 13, color: "#1B3A8A", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Cómo exportar DWG a PDF para ArchiCheck
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          ["1", "Abre el archivo en AutoCAD o software CAD compatible."],
          ["2", "Ve a Archivo → Imprimir / Plot (Ctrl+P)."],
          ["3", "En Impresora/Trazador selecciona DWG To PDF.pc3 o Microsoft Print to PDF."],
          ["4", "Configura escala: elige una escala fija (1:50, 1:100 o 1:500 según el plano). No uses Ajustar a página."],
          ["5", "Activa TODAS las capas antes de exportar (Layer Properties → todas visibles)."],
          ["6", "En Opciones de trama selecciona resolución 300 DPI mínimo."],
          ["7", "Si el proyecto tiene varias hojas, usa Publicar (PUBLISH) para exportar todas en un solo PDF."],
          ["8", "Abre el PDF resultante y verifica que los textos y cotas sean legibles antes de subir."],
        ].map(([n, texto]) => (
          <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span style={{ background: "#1B3A8A", color: "white", borderRadius: "50%", width: 22, height: 22, minWidth: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{n}</span>
            <span style={{ fontSize: 13, color: "#3D4A5C", lineHeight: 1.5 }}>{texto}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "10px 14px", background: "#FEF3CD", border: "1px solid #D68910", borderRadius: 7, fontSize: 12, color: "#7D5A00" }}>
        ⚠ ArchiCheck no acepta archivos DWG ni DXF directamente.
        Convierte a PDF siguiendo los pasos anteriores y vuelve a subir.
      </div>
    </div>
  );

  const ModalDwg = () => modalDwg ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(27,58,138,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 14, padding: 28, maxWidth: 620, width: "100%", boxShadow: "0 25px 50px rgba(27,58,138,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#C0392B", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ✗ Formato no compatible
          </span>
          <button onClick={() => setModalDwg(false)} style={{ background: "none", border: "none", color: "#6B7A99", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        <InstruccionesDwg />
        <button onClick={() => setModalDwg(false)} style={{ marginTop: 16, width: "100%", background: "linear-gradient(90deg,#1B3A8A,#2952A3)", color: "white", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: "0.04em", fontFamily: "inherit" }}>
          Entendido — voy a convertir el archivo a PDF
        </button>
      </div>
    </div>
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FB", color: "#3D4A5C", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .35s ease forwards}
        .file-row:hover{background:#EEF2FB!important}
        .rm:hover{color:#C0392B!important}
        .doc-card{transition:all .2s}
        .doc-card:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(27,58,138,0.10)}
        .obs-card:hover{border-color:rgba(74,114,196,.5)!important}
        input,select,textarea{outline:none}
        select option{background:#FFFFFF}
      `}</style>

      {/* Banda superior */}
      <div style={{ height: 3, background: "linear-gradient(90deg, #1B3A8A, #2952A3, #4A72C4)" }} />

      {/* Header */}
      <header style={{ padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1B3A8A" }}>
        <div onClick={resetApp} style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
          <svg width="36" height="36" viewBox="0 0 36 36">
            <rect width="36" height="36" rx="9" fill="rgba(255,255,255,0.15)"/>
            <path d="M18 7L29 13V23L18 29L7 23V13Z" fill="none" stroke="#A8BFEE" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M18 7V29M7 13L29 13M7 23L29 23" stroke="#A8BFEE" strokeWidth="0.6" opacity="0.6"/>
            <circle cx="18" cy="18" r="2.5" fill="white" opacity="0.9"/>
          </svg>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "'Inter', sans-serif", color: "#FFFFFF", letterSpacing: "-0.4px" }}>ArchiCheck</div>
            <div style={{ fontSize: 9, color: "#A8BFEE", letterSpacing: "3px" }}>REVISIÓN NORMATIVA · CHILE · 24-ABR</div>
          </div>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1.8 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>OGUC · LGUC · NCh · SEIA</div>
          <a href="/ArchiCheck_Guia_Normativa.pdf" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 700, color: "#A8BFEE", textDecoration: "none", letterSpacing: "0.03em" }}>
            ¿Cómo funciona ArchiCheck?
          </a>
        </div>
      </header>

      <ModalDwg />

      <main style={result ? { padding: 0 } : { maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* ── FORMULARIO ─────────────────────────────────────────────── */}
        {!result && (
          <div className="fade-up" style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 14, boxShadow: "0 2px 12px rgba(27,58,138,0.07)", padding: "32px 28px" }}>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontFamily: "'Inter', sans-serif", fontSize: 30, fontWeight: 800, color: "#1B3A8A", margin: "0 0 8px", lineHeight: 1.15 }}>
                Sube el expediente.<br/>
                <span style={{ color: "#2952A3" }}>Hacemos la revisión por ti.</span>
              </h1>
              <p style={{ color: "#6B7A99", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
                PDFs de planos, memorias, especificaciones, formularios MINVU.<br/>
                Recibirás observaciones detalladas por documento antes de presentar a la DOM.
              </p>
            </div>

            {/* Tipo + Comuna */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px" }}>TIPO DE PROYECTO</span>
                <select value={tipo} onChange={e => setTipo(e.target.value)}
                  style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 8, padding: "10px 12px", color: "#3D4A5C", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                  {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <SelectorComuna
                value={comuna}
                onChange={setComuna}
                required={true}
              />
            </div>

            {/* Botón Cómo subir DWG */}
            <div style={{ marginBottom: 12 }}>
              <button onClick={() => setModalDwg(true)} style={{ background: "none", border: "1px solid #4A72C4", borderRadius: 7, padding: "7px 14px", color: "#2952A3", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                📐 Cómo subir archivos DWG
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current.click()}
              style={{ border: `2px dashed ${dragOver ? "#1B3A8A" : "#4A72C4"}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", cursor: "pointer", transition: "all .2s", background: dragOver ? "#D6E0F5" : "#EEF2FB", marginBottom: 14 }}>
              <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
                style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>⬆</div>
              <div style={{ fontSize: 13, color: "#2952A3", marginBottom: 4 }}>
                Arrastra archivos o <span style={{ color: "#1B3A8A", fontWeight: 600 }}>haz clic para seleccionar</span>
              </div>
              <div style={{ fontSize: 11, color: "#4A72C4" }}>PDF · JPG · PNG · DWG · DXF</div>
            </div>

            {/* Lista archivos */}
            {archivos.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px", marginBottom: 8 }}>
                  ARCHIVOS — {archivos.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {archivos.map((f, i) => (
                    <div key={i} style={{ background: "#F4F6FB", border: "1px solid #D1D9EE", borderRadius: 8, overflow: "hidden", transition: "all .15s" }}>
                      {/* Fila principal */}
                      <div className="file-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
                        <span style={{ fontSize: 15, flexShrink: 0 }}>
                          {f.isImage ? "🖼" : f.name.match(/\.(dwg|dxf)$/i) ? "📐" : "📄"}
                        </span>
                        <span style={{ fontSize: 12, color: "#1B3A8A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <span style={{ fontSize: 10, color: "#6B7A99", flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                        <select value={f.tipoDoc} onChange={e => { setTipoDoc(i, e.target.value); setSinTipo(false); }}
                          style={{ background: "#FFFFFF", border: `1px solid ${sinTipo && !f.tipoDoc ? "#D68910" : "#D1D9EE"}`, borderRadius: 6, padding: "4px 8px", color: !f.tipoDoc && sinTipo ? "#D68910" : "#3D4A5C", fontSize: 11, fontFamily: "inherit", cursor: "pointer", maxWidth: 190, fontWeight: sinTipo && !f.tipoDoc ? 600 : 400 }}>
                          <option value="">{sinTipo && !f.tipoDoc ? "⚠ indicar tipo" : "— tipo —"}</option>
                          {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button className="rm" onClick={() => removeFile(i)}
                          style={{ background: "none", border: "none", color: "#6B7A99", cursor: "pointer", fontSize: 14, padding: "0 4px", transition: "color .15s" }}>✕</button>
                      </div>
                      {/* Selección de páginas — todos los PDFs */}
                      {f.type === "application/pdf" && f.pdfImages?.length > 0 && (
                        <div style={{ borderTop: "1px solid #D1D9EE", padding: "8px 12px 10px" }}>
                          <div style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "1px", marginBottom: 7 }}>
                            PÁGINAS — {f.paginasSeleccionadas.length}/{f.pdfImages.length} seleccionadas
                            {f.pdfImages[0].total > MAX_PDF_PAGES && (
                              <span style={{ color: "#D68910", marginLeft: 8 }}>
                                (PDF tiene {f.pdfImages[0].total} — se muestran primeras {MAX_PDF_PAGES})
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {f.pdfImages.map(img => {
                              const sel = f.paginasSeleccionadas.includes(img.page);
                              return (
                                <button key={img.page} onClick={() => togglePagina(i, img.page)}
                                  title={`Página ${img.page}`}
                                  style={{ position: "relative", padding: 0, border: `2px solid ${sel ? "#2952A3" : "#D1D9EE"}`, borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "none", opacity: sel ? 1 : 0.45, transition: "all .15s", flexShrink: 0 }}>
                                  <img src={img.thumb} alt={`Pág. ${img.page}`}
                                    style={{ display: "block", width: 52, height: 66, objectFit: "cover" }} />
                                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: sel ? "rgba(27,58,138,0.82)" : "rgba(0,0,0,0.45)", color: "white", fontSize: 9, textAlign: "center", padding: "2px 0", fontFamily: "'DM Mono', monospace" }}>
                                    {img.page}
                                  </div>
                                  {sel && (
                                    <div style={{ position: "absolute", top: 2, right: 2, width: 13, height: 13, borderRadius: "50%", background: "#2952A3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "white", fontWeight: 700 }}>✓</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preguntas de contexto */}
            {archivos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px", marginBottom: 10 }}>CONTEXTO DEL EXPEDIENTE</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Pregunta 1: situación existente / propuesta */}
                  <div>
                    <div style={{ fontSize: 12, color: "#3D4A5C", marginBottom: 6 }}>¿El expediente incluye situación existente y propuesta?</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["Solo propuesta", "Existente + propuesta"].map(op => (
                        <button key={op}
                          onClick={() => setPreguntas(p => ({ ...p, situacion: p.situacion === op ? "" : op, analizarSituacion: p.situacion === op ? "" : p.analizarSituacion }))}
                          style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${preguntas.situacion === op ? "#2952A3" : "#D1D9EE"}`, background: preguntas.situacion === op ? "#EEF2FB" : "#FFFFFF", color: preguntas.situacion === op ? "#1B3A8A" : "#6B7A99", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: preguntas.situacion === op ? 600 : 400, transition: "all .15s" }}>
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subpregunta: qué analizar */}
                  {preguntas.situacion === "Existente + propuesta" && (
                    <div style={{ paddingLeft: 12, borderLeft: "2px solid #D1D9EE" }}>
                      <div style={{ fontSize: 12, color: "#3D4A5C", marginBottom: 6 }}>¿Qué analizo?</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {["Solo la propuesta", "Ambas"].map(op => (
                          <button key={op}
                            onClick={() => setPreguntas(p => ({ ...p, analizarSituacion: p.analizarSituacion === op ? "" : op }))}
                            style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${preguntas.analizarSituacion === op ? "#2952A3" : "#D1D9EE"}`, background: preguntas.analizarSituacion === op ? "#EEF2FB" : "#FFFFFF", color: preguntas.analizarSituacion === op ? "#1B3A8A" : "#6B7A99", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: preguntas.analizarSituacion === op ? 600 : 400, transition: "all .15s" }}>
                            {op}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pregunta 2: niveles */}
                  <div>
                    <div style={{ fontSize: 12, color: "#3D4A5C", marginBottom: 6 }}>
                      ¿Qué nivel o niveles quieres priorizar?{" "}
                      <span style={{ color: "#6B7A99", fontSize: 11 }}>(opcional)</span>
                    </div>
                    <input
                      value={preguntas.niveles}
                      onChange={e => setPreguntas(p => ({ ...p, niveles: e.target.value }))}
                      placeholder="Ej: todos, primer piso, nivel 2 y 3"
                      style={{ width: "100%", border: "1px solid #D1D9EE", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#3D4A5C", fontFamily: "inherit", background: "#FFFFFF" }}
                    />
                  </div>

                </div>
              </div>
            )}

            {/* Resultados Colab — requerido para analizar */}
            <div style={{ marginBottom: 18, border: `1px solid ${(!colabJson || !colabPngs.length) ? "#E74C3C" : "#D1D9EE"}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#F4F6FB", borderBottom: "1px solid #D1D9EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px" }}>RESULTADOS COLAB</span>
                <span style={{ fontSize: 10, color: (!colabJson || !colabPngs.length) ? "#E74C3C" : "#B8C5E0" }}>
                  {(!colabJson || !colabPngs.length) ? "requerido para analizar" : "medición geométrica OpenCV"}
                </span>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {/* JSON */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colabJson ? "#1E8449" : "#2952A3", background: colabJson ? "rgba(30,132,73,0.06)" : "#EEF2FB", border: `1px solid ${colabJson ? "rgba(30,132,73,0.35)" : "#D1D9EE"}`, borderRadius: 7, padding: "7px 13px", fontFamily: "inherit", transition: "all .15s" }}>
                    <input ref={colabInputRef} type="file" accept=".json" style={{ display: "none" }}
                      onChange={e => handleColabJson(e.target.files[0])} />
                    <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }}>.json</span>
                    {colabJson ? " ✓ cargado" : " — subir JSON"}
                  </label>
                  {colabJson && (
                    <>
                      <span style={{ fontSize: 11, color: "#6B7A99" }}>
                        {colabJson.paginas
                          ? `${colabJson.paginas.length} pág. · ${colabJson.resumen_global?.incumplimientos_geo_total ?? 0} incump. Colab`
                          : `${colabJson.tabla_cruzada?.length ?? 0} recintos`}
                      </span>
                      <button onClick={() => { setColabJson(null); if (colabInputRef.current) colabInputRef.current.value = ""; }}
                        style={{ background: "none", border: "none", color: "#B8C5E0", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}>✕</button>
                    </>
                  )}
                </div>
                {/* PNGs */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colabPngs.length ? "#1E8449" : "#2952A3", background: colabPngs.length ? "rgba(30,132,73,0.06)" : "#EEF2FB", border: `1px solid ${colabPngs.length ? "rgba(30,132,73,0.35)" : "#D1D9EE"}`, borderRadius: 7, padding: "7px 13px", fontFamily: "inherit", transition: "all .15s" }}>
                      <input ref={colabPngInputRef} type="file" accept="image/png,image/jpeg" multiple style={{ display: "none" }}
                        onChange={e => handleColabPngs(e.target.files)} />
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }}>.png</span>
                      {colabPngs.length ? ` ✓ ${colabPngs.length} imagen${colabPngs.length > 1 ? "es" : ""} cargada${colabPngs.length > 1 ? "s" : ""}` : " — subir PNGs"}
                    </label>
                  </div>
                  {colabPngs.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                      {colabPngs.map((p, i) => {
                        const pagJson = colabJson?.paginas?.find(pg => pg.entry_idx === p.entryIdx);
                        const dimsOk = p.entryIdx == null || !pagJson || (pagJson.imagen_w_px === p.srcWidth && pagJson.imagen_h_px === p.srcHeight);
                        return (
                          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(30,132,73,0.06)", border: "1px solid rgba(30,132,73,0.2)", borderRadius: 5, padding: "3px 8px 3px 6px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "#1E8449", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                              {p.srcWidth && <span style={{ fontSize: 9, color: "#6B7A99" }}>{p.srcWidth}×{p.srcHeight}px</span>}
                              {colabJson?.paginas?.length > 0 && (
                                <select value={p.entryIdx ?? ""} onChange={e => asignarPaginaColabPng(i, e.target.value !== "" ? Number(e.target.value) : null)}
                                  style={{ fontSize: 10, border: "1px solid #D1D9EE", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                                  <option value="">— página —</option>
                                  {colabJson.paginas.map(pg => (
                                    <option key={pg.entry_idx} value={pg.entry_idx}>página {pg.pagina}{pg.fname_tag ? ` — ${pg.fname_tag}` : ""}</option>
                                  ))}
                                </select>
                              )}
                              <button onClick={() => removeColabPng(i)}
                                style={{ background: "none", border: "none", color: "#B8C5E0", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                            </div>
                            {p.entryIdx != null && !dimsOk && (
                              <div style={{ fontSize: 10, color: "#C0392B", padding: "2px 6px" }}>
                                ⚠ Este PNG mide {p.srcWidth}×{p.srcHeight}px, pero Colab midió {pagJson.imagen_w_px}×{pagJson.imagen_h_px}px para esta página — sube el PNG generado por esa misma corrida.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Revisión gráfica de geometría — gate obligatorio antes de analizar */}
            {colabJson && entriesConPng.length > 0 && (
              <RevisionGraficaGeometria
                entriesConPng={entriesConPng}
                revisionConfirmada={revisionConfirmada}
                onAbrirModal={() => { setReviewModalStep(0); setReviewModalOpen(true); }}
                onExportarDataset={exportDatasetMuros}
              />
            )}

            {reviewModalOpen && (
              <RevisionModal
                colabJson={colabJson}
                colabPngs={colabPngs}
                correcciones={colabCorrecciones}
                entriesConPng={entriesConPng}
                stepIndex={reviewModalStep}
                setStepIndex={setReviewModalStep}
                tool={reviewTool}
                setTool={handleCambiarHerramienta}
                selectedId={reviewSelectedId}
                selectedTipo={reviewSelectedTipo}
                linePoints={reviewLinePoints}
                fusionSet={reviewFusionSet}
                onSeleccionar={handleSeleccionarEnCanvas}
                onLinePoint={handleReviewLinePoint}
                onMoverDestino={handleMoverDestino}
                onConfirmarMuro={handleConfirmarMuro}
                onToggleFusion={handleToggleFusion}
                onConfirmarFusion={handleConfirmarFusion}
                onGuardarRecinto={patch => { aplicarCorreccionRecinto(reviewSelectedId, patch); setReviewSelectedId(null); setReviewSelectedTipo(null); }}
                onEliminarRecinto={() => eliminarRecinto(reviewSelectedId)}
                onGuardarElemento={(item, patch) => { aplicarCorreccionElemento(item, patch); setReviewSelectedId(null); setReviewSelectedTipo(null); }}
                onEliminarElemento={(item, motivo) => eliminarElemento(item, motivo)}
                onMoverElemento={() => setReviewTool("mover")}
                onCerrarPanel={() => { setReviewSelectedId(null); setReviewSelectedTipo(null); }}
                onFinalizar={handleFinalizarModal}
                onCerrarModal={() => setReviewModalOpen(false)}
              />
            )}

            {/* Parámetros cuantitativos — verificación determinista (opcional) */}
            {COMUNAS_CON_VERIFICACION.includes(comuna) && (
              <div style={{ marginBottom: 14, border: "1px solid #D1D9EE", borderRadius: 10, overflow: "hidden" }}>
                <button
                  onClick={() => setFichaExpanded(p => !p)}
                  style={{ width: "100%", background: "#F4F6FB", border: "none", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#2952A3" }}>
                    ⚙️ Parámetros cuantitativos (opcional — para verificación determinista)
                  </span>
                  <span style={{ fontSize: 11, color: "#6B7A99" }}>{fichaExpanded ? "▾" : "▸"}</span>
                </button>
                {fichaExpanded && (
                  <div style={{ padding: "14px 16px", background: "#fff" }}>
                    <p style={{ fontSize: 11, color: "#6B7A99", margin: "0 0 12px", lineHeight: 1.6 }}>
                      Si declaras estos valores, el sistema calculará cumplimiento de COS, CC, altura y subdivisión sin varianza — resultado determinista, no LLM.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {/* Zona */}
                      <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "1.5px" }}>ZONA NORMATIVA</span>
                        <select value={fichaProyecto.zonaId}
                          onChange={e => setFichaProyecto(p => ({ ...p, zonaId: e.target.value }))}
                          style={{ background: "#fff", border: "1px solid #D1D9EE", borderRadius: 7, padding: "8px 10px", color: "#3D4A5C", fontSize: 12, fontFamily: "inherit" }}>
                          <option value="">— Selecciona zona —</option>
                          {listarZonas(comuna).map(z => (
                            <option key={z.id} value={z.id}>{z.id} — {z.nombre}</option>
                          ))}
                        </select>
                      </label>
                      {[
                        { key: "superficieTerreno",  label: "SUP. TERRENO (m²)",    placeholder: "ej. 320" },
                        { key: "cosProyectado",       label: "COS PROYECTADO",       placeholder: "ej. 0.65" },
                        { key: "ccProyectado",        label: "CC PROYECTADO",        placeholder: "ej. 1.8" },
                        { key: "alturaM",             label: "ALTURA (m)",           placeholder: "ej. 9.5" },
                        { key: "pisosProyectados",    label: "PISOS",                placeholder: "ej. 3" },
                        { key: "anchoCalleFrentera",  label: "ANCHO CALLE FRONT. (m)", placeholder: "ej. 10" },
                      ].map(({ key, label, placeholder }) => (
                        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "1.5px" }}>{label}</span>
                          <input
                            type="number" min="0" step="any"
                            value={fichaProyecto[key]}
                            onChange={e => setFichaProyecto(p => ({ ...p, [key]: e.target.value }))}
                            placeholder={placeholder}
                            style={{ background: "#fff", border: "1px solid #D1D9EE", borderRadius: 7, padding: "8px 10px", color: "#3D4A5C", fontSize: 12, fontFamily: "inherit", width: "100%" }} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Botón analizar */}
            {(() => { const bloqueado = loading || !archivos.length || !colabJson || !colabPngs.length || !revisionConfirmada; return (
            <button onClick={analizar}
              disabled={bloqueado}
              style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 600, letterSpacing: ".4px", cursor: bloqueado ? "not-allowed" : "pointer", transition: "all .2s", background: bloqueado ? "#B8C5E0" : "linear-gradient(90deg,#1B3A8A,#2952A3)", color: "#FFFFFF" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #B8C5E0", borderTop: "2px solid #1B3A8A", borderRadius: "50%", animation: "spin .7s linear infinite" }}/>
                  <span style={{ animation: "pulse 1.4s infinite" }}>{progress}</span>
                </span>
              ) : `Analizar ${archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? "s" : ""}` : "expediente"} →`}
            </button>
            ); })()}

            {colabJson && colabPngs.length > 0 && !revisionConfirmada && (
              <p style={{ fontSize: 11, color: "#C0392B", textAlign: "center", marginTop: 8 }}>
                Confirma la revisión gráfica de geometría antes de analizar.
              </p>
            )}

            {!comuna && archivos.length > 0 && (
              <p style={{ fontSize: 11, color: "#6B7A99", textAlign: "center", marginTop: 8 }}>
                Sin comuna seleccionada el análisis no incluirá normativa del PRC local
              </p>
            )}

            {error && (
              <div style={{ marginTop: 12, background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#C0392B" }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── RESULTADO ──────────────────────────────────────────────── */}
        {result && (
          <div className="fade-up" style={{ display:"flex", alignItems:"flex-start" }}>

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <div style={{ width:240, background:"#fff", borderRight:"1px solid #E0E6F3", flexShrink:0, position:"sticky", top:0, height:"100vh", overflowY:"auto", alignSelf:"flex-start" }}>
              <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid #EEF2FB" }}>
                <div style={{ fontSize:9, color:"#6B7A99", letterSpacing:"2px", marginBottom:6 }}>REVISIÓN NORMATIVA</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:"3px 10px", borderRadius:99, ...ec }}>{result.estado_global}</span>
                </div>
              </div>
              <div style={{ padding:"12px 0" }}>
                <div style={{ padding:"6px 16px 4px", fontSize:10, fontWeight:700, color:"#B8C5E0", letterSpacing:"1px" }}>CAPA 1 — LEVANTAMIENTO</div>
                {ETAPAS.filter(e => e.capa === "c1").map(e => (
                  <button key={e.id} onClick={() => setActiveEtapa(e.id)}
                    style={{ width:"100%", background:activeEtapa===e.id?"#EEF2FB":"none", border:"none", borderLeft:`3px solid ${activeEtapa===e.id?"#2952A3":"transparent"}`, cursor:"pointer", padding:"9px 16px", display:"flex", alignItems:"center", gap:10, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:activeEtapa===e.id?"#2952A3":"#D1D9EE", color:activeEtapa===e.id?"#fff":"#6B7A99", fontSize:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{e.dot}</div>
                    <span style={{ fontSize:12, color:activeEtapa===e.id?"#1B3A8A":"#6B7A99", fontWeight:activeEtapa===e.id?600:400 }}>{e.label}</span>
                  </button>
                ))}
                <div style={{ height:1, background:"#EEF2FB", margin:"8px 16px" }} />
                <div style={{ padding:"6px 16px 4px", fontSize:10, fontWeight:700, color:"#B8C5E0", letterSpacing:"1px" }}>CAPA 2 — NORMATIVA</div>
                {ETAPAS.filter(e => e.capa === "c2").map(e => (
                  <button key={e.id} onClick={() => setActiveEtapa(e.id)}
                    style={{ width:"100%", background:activeEtapa===e.id?(e.id==="report"?"rgba(27,58,138,0.08)":"#EEF2FB"):"none", border:"none", borderLeft:`3px solid ${activeEtapa===e.id?(e.id==="report"?"#1B3A8A":"#2952A3"):"transparent"}`, cursor:"pointer", padding:"9px 16px", display:"flex", alignItems:"center", gap:10, textAlign:"left", transition:"all .15s" }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:activeEtapa===e.id?(e.id==="report"?"#1B3A8A":"#2952A3"):"#D1D9EE", color:activeEtapa===e.id?"#fff":"#6B7A99", fontSize:e.id==="report"?11:10, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{e.dot}</div>
                    <span style={{ fontSize:12, color:activeEtapa===e.id?"#1B3A8A":"#6B7A99", fontWeight:activeEtapa===e.id?600:400 }}>{e.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Contenido por etapa ──────────────────────────────────── */}
            <div style={{ flex:1, padding:"32px 36px", minWidth:0 }}>

            {/* NO LEGIBLE warning */}
            {result.analisis_por_archivo?.some(a => a.estado === "NO LEGIBLE") && (
              <div style={{ marginBottom:20, background:"#FEF3CD", border:"1px solid #D68910", borderRadius:10, padding:"16px 20px" }}>
                <p style={{ margin:"0 0 12px", fontWeight:700, fontSize:13, color:"#7D5A00", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:"0.06em" }}>⚠ Documento no legible detectado</p>
                <InstruccionesDwg />
              </div>
            )}

            {/* E1 — Separación Gráfica */}
            {activeEtapa === "e1" && (() => {
              const d = result.capa1?.separacion;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa 1 — Separación Gráfica</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>El sistema distingue geometría real vs. texto, cotas, simbología y ruido visual</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(41,82,163,0.08)", color:"#2952A3", border:"1px solid rgba(41,82,163,0.25)", whiteSpace:"nowrap" }}>Capa 1 · Paso 1/4</span>
                    </div>
                  </div>
                  <SectionTitle>📄 Capas detectadas</SectionTitle>
                  {d?.capas?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Capa","Contenido identificado","Páginas","Estado"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.capas.map((c,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{c.nombre}</td><td style={TD}>{c.contenido}</td><td style={{ ...TD, whiteSpace:"nowrap" }}>{c.paginas}</td><td style={TD}><StatusBadge val={c.estado} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de separación — analiza un plano para ver resultados</p>}
                  <EtapaRefs refs={result.capa1?.separacion?._refs} />
                </div>
              );
            })()}

            {/* E2 — Reconocimiento */}
            {activeEtapa === "e2" && (() => {
              const d = result.capa1?.reconocimiento;
              const niveles = d?.recintos_por_nivel || [];
              const docsConRecintos = (result.analisis_por_archivo || []).filter(doc => doc.recintos?.some(r => Array.isArray(r.bbox)));
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa 2 — Reconocimiento de Elementos</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>El sistema identifica recintos, circulaciones y elementos relevantes por nivel</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(41,82,163,0.08)", color:"#2952A3", border:"1px solid rgba(41,82,163,0.25)", whiteSpace:"nowrap" }}>Capa 1 · Paso 2/4</span>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                    {[
                      { n:d?.stats?.recintos_total??0, label:"Recintos identificados", c:"#1B3A8A" },
                      { n:d?.stats?.niveles??0,         label:"Niveles procesados",    c:"#2952A3" },
                      { n:d?.observaciones?.length??0,  label:"Observaciones",         c:"#D68910" },
                    ].map(m => (
                      <div key={m.label} style={{ background:"#fff", border:"1px solid #D1D9EE", borderRadius:10, padding:"14px", textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Inter',sans-serif", color:m.c, lineHeight:1 }}>{m.n}</div>
                        <div style={{ fontSize:10, color:"#6B7A99", marginTop:3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {niveles.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <SectionTitle>🏢 Mapa de recintos por nivel</SectionTitle>
                      {niveles.length > 1 && (
                        <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
                          {niveles.map((n,i) => <button key={i} onClick={() => setActiveFloor(i)} style={{ padding:"5px 14px", borderRadius:20, border:"none", background:activeFloor===i?"#2952A3":"#E0E6F3", color:activeFloor===i?"#fff":"#6B7A99", cursor:"pointer", fontSize:12, fontWeight:600, transition:"all .15s" }}>{n.nivel}</button>)}
                        </div>
                      )}
                      {niveles[activeFloor] && (
                        <div style={{ overflowX:"auto" }}>
                          <table style={{ width:"100%", borderCollapse:"collapse" }}>
                            <thead><tr>{["Recinto","Uso","Superficie m²","Estado"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                            <tbody>{(niveles[activeFloor].recintos||[]).map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}><ElemLabel nombre={r.nombre} id={r._colab_id} /></td><td style={TD}>{r.uso||"—"}</td><td style={TD}>{r.superficie_m2!=null ? <>{r.superficie_m2}{r._from_colab && <span title="Estimación OpenCV Colab" style={{color:"#B8C5E0",fontSize:10}}> ~</span>}</> : "—"}</td><td style={TD}><StatusBadge val={r.estado} /></td></tr>)}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                  {docsConRecintos.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <SectionTitle>📍 Vista anotada — posiciones estimadas IA</SectionTitle>
                      <div style={{ display:"flex", gap:12, marginBottom:10, flexWrap:"wrap" }}>
                        {[["OK","#1E8449"],["OBSERVADO","#D68910"],["INCUMPLE","#C0392B"]].map(([lbl,col]) => (
                          <div key={lbl} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#6B7A99" }}><div style={{ width:12, height:12, borderRadius:2, background:col+"28", border:`2px solid ${col}` }}/>{lbl}</div>
                        ))}
                      </div>
                      {docsConRecintos.map((doc,di) => {
                        const archivoMatch = archivos.find(a => a.name === doc.archivo);
                        const recintos = doc.recintos.filter(r => Array.isArray(r.bbox));
                        const paginas = [...new Set(recintos.map(r => r.pagina))].sort((a,b)=>a-b);
                        return paginas.map(pag => {
                          let src = null;
                          if (archivoMatch?.pdfImages) src = archivoMatch.pdfImages.find(p => p.page===pag)?.thumb||null;
                          else if (archivoMatch?.isImage && archivoMatch.base64) src = `data:${archivoMatch.type};base64,${archivoMatch.base64}`;
                          if (!src) return null;
                          return <div key={`${di}-${pag}`} style={{ marginBottom:12 }}><div style={{ fontSize:10, color:"#6B7A99", marginBottom:4 }}>{doc.archivo} — Pág. {pag}</div><CanvasOverlay src={src} recintos={recintos} pagina={pag} /></div>;
                        });
                      })}
                    </div>
                  )}
                  {colabPngs.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <SectionTitle>🔬 Análisis geométrico Colab (OpenCV)</SectionTitle>
                      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                        {colabPngs.map((p,i) => (
                          <div key={i}><div style={{ fontSize:10, color:"#6B7A99", marginBottom:4, fontFamily:"'DM Mono',monospace" }}>{p.name}</div><img src={`data:image/jpeg;base64,${p.base64}`} alt={p.name} style={{ width:"100%", borderRadius:8, border:"1px solid #D1D9EE" }} /></div>
                        ))}
                      </div>
                    </div>
                  )}
                  <EtapaRefs refs={result.capa1?.reconocimiento?._refs} />
                </div>
              );
            })()}

            {/* E3 — Vectorización */}
            {activeEtapa === "e3" && (() => {
              const d = result.capa1?.vectorizacion;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa 3 — Vectorización</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Elementos geométricos extraídos y clasificados del plano</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(41,82,163,0.08)", color:"#2952A3", border:"1px solid rgba(41,82,163,0.25)", whiteSpace:"nowrap" }}>Capa 1 · Paso 3/4</span>
                    </div>
                  </div>
                  <SectionTitle>📐 Elementos identificados</SectionTitle>
                  {d?.elementos?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Tipo","Cant.","Descripción","Páginas","Estado"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.elementos.map((e,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{e.tipo}</td><td style={{ ...TD, textAlign:"center" }}>{e.cantidad}</td><td style={TD}>{e.descripcion}</td><td style={{ ...TD, whiteSpace:"nowrap" }}>{e.paginas}</td><td style={TD}><StatusBadge val={e.estado} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de vectorización</p>}
                  <EtapaRefs refs={result.capa1?.vectorizacion?._refs} />
                </div>
              );
            })()}

            {/* E4 — Modelo Estructural */}
            {activeEtapa === "e4" && (() => {
              const d = result.capa1?.modelo;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa 4 — Modelo Estructural</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Organización funcional, accesos y sistemas de evacuación</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(41,82,163,0.08)", color:"#2952A3", border:"1px solid rgba(41,82,163,0.25)", whiteSpace:"nowrap" }}>Capa 1 · Paso 4/4</span>
                    </div>
                  </div>
                  <SectionTitle>🏗️ Organización funcional</SectionTitle>
                  {d?.organizacion_funcional?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:20 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Nivel","Uso","Área m²","Conexión"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.organizacion_funcional.map((o,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{o.nivel}</td><td style={TD}>{o.uso}</td><td style={TD}>{o.area_m2??"—"}</td><td style={TD}>{o.conexion||"—"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12, marginBottom:16 }}>Sin datos de organización funcional</p>}
                  <SectionTitle>🚪 Accesos y evacuación</SectionTitle>
                  {d?.accesos_evacuacion?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Elemento","Estado","Nota"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.accesos_evacuacion.map((a,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{a.elemento}</td><td style={TD}><StatusBadge val={a.estado} /></td><td style={TD}>{a.nota||"—"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de accesos</p>}
                  <EtapaRefs refs={result.capa1?.modelo?._refs} />
                </div>
              );
            })()}

            {/* N1 — Recintos y Superficies */}
            {activeEtapa === "n1" && (() => {
              const d = result.capa2?.recintos_superficies;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa A — Recintos y Superficies</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Verificación de superficies mínimas por tipo de recinto según OGUC</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(214,137,16,0.08)", color:"#D68910", border:"1px solid rgba(214,137,16,0.25)", whiteSpace:"nowrap" }}>Capa 2 · A/D</span>
                    </div>
                  </div>
                  <SectionTitle>📐 Verificación de superficies mínimas</SectionTitle>
                  {d?.tabla?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Recinto","Uso","Sup. real m²","Sup. mín. m²","Cumple","Artículo"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.recinto}</td><td style={TD}>{r.uso||"—"}</td><td style={TD}>{r.sup_real_m2??"—"}</td><td style={TD}>{r.sup_minima_m2??"—"}</td><td style={TD}><StatusBadge val={r.cumple} /></td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{r.articulo||"—"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de superficies</p>}
                  <EtapaRefs refs={result.capa2?.recintos_superficies?._refs} />
                </div>
              );
            })()}

            {/* N2 — Circulaciones */}
            {activeEtapa === "n2" && (() => {
              const d = result.capa2?.circulaciones;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa B — Circulaciones</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Verificación de anchos mínimos de pasillos, escaleras y accesos según OGUC</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(214,137,16,0.08)", color:"#D68910", border:"1px solid rgba(214,137,16,0.25)", whiteSpace:"nowrap" }}>Capa 2 · B/D</span>
                    </div>
                  </div>
                  <SectionTitle>🚶 Anchos y requisitos de circulación</SectionTitle>
                  {d?.tabla?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Elemento","Ancho real (m)","Ancho mín. (m)","Artículo","Cumple"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}><ElemLabel nombre={r.elemento} id={r._colab_id} /></td><td style={{ ...TD, textAlign:"center" }}>{r.ancho_real_m??"—"}</td><td style={{ ...TD, textAlign:"center" }}>{r.ancho_minimo_m??"—"}</td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{r.articulo||"—"}</td><td style={TD}><StatusBadge val={r.cumple} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de circulaciones</p>}
                  <EtapaRefs refs={result.capa2?.circulaciones?._refs} />
                </div>
              );
            })()}

            {/* N3 — Iluminación y Ventilación */}
            {activeEtapa === "n3" && (() => {
              const d = result.capa2?.iluminacion_ventilacion;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa C — Iluminación y Ventilación</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Verificación de relación ventana/área de recinto según OGUC Art. 4.5.7</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(214,137,16,0.08)", color:"#D68910", border:"1px solid rgba(214,137,16,0.25)", whiteSpace:"nowrap" }}>Capa 2 · C/D</span>
                    </div>
                  </div>
                  <SectionTitle>🔆 Relación ventana / área por recinto</SectionTitle>
                  {d?.tabla?.length ? (() => {
                    const sinVentanas = d.tabla.every(r => !r.area_ventana_m2);
                    return (
                      <>
                        {sinVentanas && (
                          <div style={{ background:"#FFF8E1", border:"1px solid #F9A825", borderRadius:6, padding:"8px 12px", marginBottom:10, fontSize:12, color:"#7B5800" }}>
                            ⚠ Áreas de ventana no detectadas automáticamente. Verificar cuadro de vanos en el plano para determinar cumplimiento real de iluminación natural (OGUC Art. 4.5.7).
                          </div>
                        )}
                        <div style={{ overflowX:"auto", marginBottom:8 }}>
                          <table style={{ width:"100%", borderCollapse:"collapse" }}>
                            <thead><tr>{["Recinto","Área ventana m²","Área recinto m²","Ratio req.","Cumple"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                            <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}><ElemLabel nombre={r.recinto} id={r._colab_id} /></td><td style={{ ...TD, textAlign:"center" }}>{r.area_ventana_m2??<span style={{color:"#B8C5E0"}}>—</span>}</td><td style={{ ...TD, textAlign:"center" }}>{r.area_recinto_m2??"—"}</td><td style={{ ...TD, textAlign:"center" }}>{r.ratio_requerido||"1/6"}</td><td style={TD}><StatusBadge val={r.cumple} /></td></tr>)}</tbody>
                          </table>
                        </div>
                      </>
                    );
                  })() : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de iluminación</p>}
                  <EtapaRefs refs={result.capa2?.iluminacion_ventilacion?._refs} />
                </div>
              );
            })()}

            {/* N4 — Normativa Urbanística */}
            {activeEtapa === "n4" && (() => {
              const d = result.capa2?.normativa_urbanistica;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa D — Normativa Urbanística</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Verificación de constructibilidad, altura, COS y uso de suelo</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(214,137,16,0.08)", color:"#D68910", border:"1px solid rgba(214,137,16,0.25)", whiteSpace:"nowrap" }}>Capa 2 · D/D</span>
                    </div>
                  </div>
                  {/* Verificación determinista — solo si el usuario declaró zona + parámetros */}
                  {verificadorResult?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <SectionTitle>⚙️ Verificación determinista — Zona {fichaProyecto.zonaId}</SectionTitle>
                      <div style={{ overflowX: "auto", marginBottom: 10 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead><tr>{["Parámetro", "Proyectado", "Límite normativo", "Cumple", "Referencia"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                          <tbody>
                            {verificadorResult.map((r, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F8F9FF" }}>
                                <td style={{ ...TD, fontWeight: 600, color: "#1B3A8A" }}>{r.parametro}</td>
                                <td style={TD}>{r.propuesto}</td>
                                <td style={{ ...TD, fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{r.limiteNormativo}</td>
                                <td style={TD}><StatusBadge val={r.cumple === true ? "OK" : r.cumple === false ? "NO" : "VERIFICAR"} /></td>
                                <td style={{ ...TD, fontFamily: "'DM Mono',monospace", fontSize: 10, color: "#2952A3" }}>{r.referencia}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {verificadorResult.some(r => r.cumple === false) && (
                        <div style={{ background: "rgba(192,57,43,0.06)", border: "1px solid rgba(192,57,43,0.2)", borderRadius: 6, padding: "10px 12px", fontSize: 11, color: "#C0392B", lineHeight: 1.6 }}>
                          Los parámetros marcados NO son incumplimientos deterministas — calculados directamente desde los valores que declaraste, sin varianza entre ejecuciones.
                        </div>
                      )}
                    </div>
                  )}

                  <SectionTitle>🏙️ Marco normativo aplicable (análisis LLM)</SectionTitle>
                  {d?.tabla?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Parámetro","Referencia normativa","Valor del proyecto","Estado"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.parametro}</td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{r.referencia}</td><td style={TD}>{r.valor_proyecto}</td><td style={TD}><StatusBadge val={r.estado} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos urbanísticos</p>}
                  <EtapaRefs refs={result.capa2?.normativa_urbanistica?._refs} />
                </div>
              );
            })()}

            {/* N5 — Consolidación */}
            {activeEtapa === "n5" && (() => {
              const todas = getConsolidado(result);
              const altas = todas.filter(x => x.obs.criticidad === "ALTA");
              const tecnicas = todas.filter(x => x.obs.criticidad !== "ALTA");
              const resueltas = Object.values(obsStatus).filter(s => s?.status).length;
              return (
                <div>
                  <div style={{ marginBottom:24 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
                      <div>
                        <h1 style={{ fontSize:22, fontWeight:800, color:"#1B3A8A", fontFamily:"'Inter',sans-serif", margin:"0 0 4px" }}>Etapa E — Consolidación</h1>
                        <p style={{ color:"#6B7A99", fontSize:13, margin:0 }}>Revisión final de todas las observaciones antes del informe</p>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:"4px 14px", borderRadius:99, background:"rgba(214,137,16,0.08)", color:"#D68910", border:"1px solid rgba(214,137,16,0.25)", whiteSpace:"nowrap" }}>Capa 2 · E/E</span>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                    {[
                      { n:altas.length,    label:"🔴 Incumplimientos", c:"#C0392B" },
                      { n:tecnicas.length, label:"🟡 Observaciones",   c:"#D68910" },
                      { n:resueltas,       label:"✅ Resueltas",        c:"#1E8449" },
                    ].map(m => (
                      <div key={m.label} style={{ background:"#fff", border:"1px solid #D1D9EE", borderRadius:10, padding:"14px", textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Inter',sans-serif", color:m.c, lineHeight:1 }}>{m.n}</div>
                        <div style={{ fontSize:10, color:"#6B7A99", marginTop:3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {altas.length > 0 && (
                    <div style={{ marginBottom:24 }}>
                      <SectionTitle>🔴 Incumplimientos probables — acción requerida</SectionTitle>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {altas.map(({ obs, key, tema }) => {
                          const obsState = obsStatus[key];
                          return (
                            <div key={key} style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.04)", borderRadius:"0 8px 8px 0", padding:"14px 16px", opacity:obsState?.status==="descartada"?0.5:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:6 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <CodigoBadge codigo={obs._codigo} size={11} />
                                  <span style={{ fontSize:11, fontWeight:700, color:"#C0392B" }}>{tema}</span>
                                </div>
                                {obsState?.status && <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[obsState.status], background:STATUS_COLORS[obsState.status]+"18", border:`1px solid ${STATUS_COLORS[obsState.status]}40`, borderRadius:4, padding:"1px 7px" }}>✓ {STATUS_LABELS[obsState.status]}</span>}
                              </div>
                              <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.6, marginBottom:8 }}>{obs.descripcion}</div>
                              {obs.articulo && <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>{obs.articulo.split(/[,;]/).map(p=>p.trim()).filter(Boolean).map((p,pi) => <span key={pi} style={{ fontSize:10, color:"#2952A3", background:"rgba(41,82,163,0.08)", border:"1px solid rgba(41,82,163,0.2)", borderRadius:4, padding:"2px 7px", fontFamily:"'DM Mono',monospace" }}>§ {p}</span>)}</div>}
                              {obs.correccion && <div style={{ fontSize:12, color:"#6B7A99", borderTop:"1px solid rgba(192,57,43,0.15)", paddingTop:8, lineHeight:1.5, marginBottom:8 }}><span style={{ color:"#C0392B", fontWeight:600 }}>→ </span>{obs.correccion}</div>}
                              <div style={{ display:"flex", gap:5, flexWrap:"wrap", paddingTop:8, borderTop:"1px solid rgba(0,0,0,0.06)" }}>
                                {OBS_ACTIONS.map(a => { const active=obsState?.status===a.id; return <button key={a.id} onClick={() => setObsAction(key, a.id)} style={{ padding:"3px 9px", fontSize:10, borderRadius:5, border:`1px solid ${active?a.color:"#D1D9EE"}`, background:active?a.color+"18":"transparent", color:active?a.color:"#6B7A99", cursor:"pointer", fontFamily:"inherit", fontWeight:active?700:400, transition:"all .15s" }}>{a.label}</button>; })}
                              </div>
                              {obsState?.status==="comentada" && <textarea value={obsState?.comment||""} onChange={e=>setObsComment(key,e.target.value)} placeholder="Escribe tu comentario..." style={{ marginTop:8, width:"100%", border:"1px solid #D1D9EE", borderRadius:6, padding:"8px 10px", fontSize:11, fontFamily:"inherit", color:"#3D4A5C", resize:"vertical", minHeight:60, outline:"none", background:"#FFFFFF" }} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {tecnicas.length > 0 && (
                    <div style={{ marginBottom:24 }}>
                      <SectionTitle>🟡 Observaciones técnicas</SectionTitle>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse" }}>
                          <thead><tr>{["Cód.","Tema","Descripción","Criticidad","Artículo"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                          <tbody>{tecnicas.map(({ obs, key, tema },i) => <tr key={key} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={TD}>{obs._codigo ? <CodigoBadge codigo={obs._codigo} size={10} pill={false} /> : "—"}</td><td style={{ ...TD, fontWeight:600, color:"#1B3A8A", whiteSpace:"nowrap" }}>{tema}</td><td style={TD}>{obs.descripcion}</td><td style={TD}><StatusBadge val={obs.criticidad==="ALTA"?"INCUMPLE":obs.criticidad==="MEDIA"?"OBSERVADO":"OK"} /></td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{obs.articulo||"—"}</td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {result.pasos_siguientes?.length > 0 && (
                    <div>
                      <SectionTitle>✅ Plan de acción prioritario</SectionTitle>
                      <div style={{ border:"1px solid #D1D9EE", borderRadius:10, overflow:"hidden" }}>
                        {result.pasos_siguientes.map((p,i) => (
                          <div key={i} style={{ display:"grid", gridTemplateColumns:"40px 1fr", gap:12, padding:"10px 14px", borderBottom:i<result.pasos_siguientes.length-1?"1px solid #EEF2FB":"none", alignItems:"flex-start", background:i===0?"rgba(192,57,43,0.03)":i===1?"rgba(214,137,16,0.03)":"#fff" }}>
                            <div style={{ width:24, height:24, borderRadius:"50%", background:i===0?"#C0392B":i===1?"#D68910":"#2952A3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>{i+1}</div>
                            <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.6 }}>{p}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Informe Final */}
            {activeEtapa === "report" && (() => {
              const ec2 = globalStyle(result.estado_global);
              const todas = getConsolidado(result);
              const altas = todas.filter(x => x.obs.criticidad === "ALTA");
              const tecnicas = todas.filter(x => x.obs.criticidad !== "ALTA");
              const resueltas = Object.values(obsStatus).filter(s => s?.status).length;
              const total = todas.length;
              const tienePRC = !!PRC_COMUNAS[comuna];
              const totalRecintos = (result.capa1?.reconocimiento?.recintos_por_nivel||[]).reduce((acc,n)=>acc+(n.recintos?.length||0),0);
              const catGroups = {};
              for (const { obs, key, tema } of tecnicas) {
                if (!catGroups[tema]) catGroups[tema] = [];
                catGroups[tema].push({ obs, key });
              }
              return (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:16, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, color:"#6B7A99", letterSpacing:"3px", marginBottom:8 }}>INFORME DE REVISIÓN NORMATIVA</div>
                      <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:22, fontWeight:800, margin:"0 0 4px", color:"#1B3A8A" }}>{TIPOS.find(t=>t.id===tipo)?.label} · {PRC_COMUNAS[comuna]?.meta?.nombre||comuna}</h2>
                      <div style={{ fontSize:11, color:"#6B7A99" }}>{new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
                    </div>
                    <div style={{ flexShrink:0 }}>
                      <span style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", padding:"5px 16px", borderRadius:99, ...ec2 }}>{result.estado_global}</span>
                    </div>
                  </div>
                  <div style={{ borderLeft:"4px solid #1B3A8A", background:"#F4F6FB", borderRadius:"0 10px 10px 0", padding:"14px 18px", marginBottom:22, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:"10px 24px" }}>
                    {[
                      { label:"TIPO DE PROYECTO", value:TIPOS.find(t=>t.id===tipo)?.label },
                      { label:"DOCUMENTOS", value:archivos.map(f=>f.name).join(", ") },
                      { label:"NORMATIVA", value:["OGUC","LGUC",tienePRC?`PRC ${PRC_COMUNAS[comuna].meta.nombre}`:null].filter(Boolean).join(" · ") },
                      { label:"FECHA", value:new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"}) },
                    ].map(({ label, value }) => <div key={label}><div style={{ fontSize:9, color:"#6B7A99", letterSpacing:"1.5px", marginBottom:3 }}>{label}</div><div style={{ fontSize:11, color:"#3D4A5C", fontWeight:500, lineHeight:1.4, wordBreak:"break-word" }}>{value}</div></div>)}
                  </div>
                  {result.tabla_observaciones?.length > 0 && (
                    <div style={{ marginBottom:20, border:"1px solid #D1D9EE", borderRadius:10, overflow:"hidden" }}>
                      <div style={{ background:"#EEF2FB", padding:"8px 14px", fontSize:9, fontWeight:700, color:"#1B3A8A", letterSpacing:"1.5px" }}>RESUMEN POR TEMA</div>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead>
                          <tr style={{ background:"#F4F6FB" }}>
                            <th style={{ padding:"5px 12px" }}></th>
                            <th style={{ padding:"5px 12px", textAlign:"center", fontSize:10, fontWeight:700, color:"#C0392B", letterSpacing:"0.5px" }}>Incumplimientos</th>
                            <th colSpan={2} style={{ padding:"5px 12px", textAlign:"center", fontSize:10, fontWeight:700, color:"#D68910", letterSpacing:"0.5px" }}>Observaciones</th>
                          </tr>
                          <tr style={{ background:"#F8F9FF" }}>{["Tema","Alta","Media","Baja"].map(h => <th key={h} style={{ padding:"6px 12px", textAlign:h==="Tema"?"left":"center", fontSize:10, fontWeight:700, color:"#6B7A99", letterSpacing:"0.5px", borderBottom:"1px solid #D1D9EE" }}>{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {result.tabla_observaciones.map((g, i) => {
                            const obs = g.observaciones || [];
                            const a = obs.filter(o => o.criticidad === "ALTA").length;
                            const m = obs.filter(o => o.criticidad === "MEDIA").length;
                            const b = obs.filter(o => o.criticidad === "BAJA").length;
                            return <tr key={i} style={{ borderBottom:"1px solid #EEF2FB", background:i%2===0?"#fff":"#FAFBFF" }}>
                              <td style={{ padding:"8px 12px", fontSize:12, color:"#3D4A5C", fontWeight:500 }}>{g.tema}</td>
                              <td style={{ padding:"8px 12px", textAlign:"center", fontSize:12, fontWeight:700, color:a>0?"#C0392B":"#D1D9EE" }}>{a>0?a:"—"}</td>
                              <td style={{ padding:"8px 12px", textAlign:"center", fontSize:12, fontWeight:700, color:m>0?"#D68910":"#D1D9EE" }}>{m>0?m:"—"}</td>
                              <td style={{ padding:"8px 12px", textAlign:"center", fontSize:12, color:b>0?"#6B7A99":"#D1D9EE" }}>{b>0?b:"—"}</td>
                            </tr>;
                          })}
                          <tr style={{ borderTop:"2px solid #1B3A8A", background:"#F8F9FF" }}>
                            <td style={{ padding:"9px 12px", fontSize:12, fontWeight:800, color:"#1B3A8A" }}>Total</td>
                            <td style={{ padding:"9px 12px", textAlign:"center", fontSize:12, fontWeight:800, color:"#C0392B" }}>{altas.length || "—"}</td>
                            <td colSpan={2} style={{ padding:"9px 12px", textAlign:"center", fontSize:12, fontWeight:800, color:"#D68910" }}>{tecnicas.length || "—"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p style={{ fontSize:13, color:"#6B7A99", lineHeight:1.7, marginBottom:24 }}>{fixResumenGeneral(result.resumen_general, altas.length, tecnicas.length)}</p>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:12 }}>
                    {[{ n:altas.length, label:"🔴 Incumplimientos", c:"#C0392B" },{ n:tecnicas.length, label:"🟡 Observaciones", c:"#D68910" },{ n:resueltas, label:"✅ Resueltas", c:"#1E8449" }].map(m => (
                      <div key={m.label} style={{ background:"#F4F6FB", border:"1px solid #D1D9EE", borderRadius:10, padding:"14px 10px", textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, fontFamily:"'Inter',sans-serif", color:m.c, lineHeight:1 }}>{m.n}</div>
                        <div style={{ fontSize:10, color:"#6B7A99", marginTop:3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {total > 0 && (
                    <div style={{ marginBottom:26 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#6B7A99", marginBottom:5 }}><span>Progreso de revisión</span><span style={{ color:resueltas===total?"#1E8449":"#6B7A99" }}>{resueltas} / {total} resueltas</span></div>
                      <div style={{ background:"#EEF2FB", borderRadius:99, height:4, overflow:"hidden" }}><div style={{ width:`${total?(resueltas/total)*100:0}%`, height:"100%", borderRadius:99, background:"linear-gradient(90deg,#1E844980,#1E8449)", transition:"width .4s ease" }} /></div>
                    </div>
                  )}
                  {altas.length > 0 && (
                    <div style={{ marginBottom:28 }}>
                      <SectionTitle>🔴 Incumplimientos — {altas.length}</SectionTitle>
                      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                        {altas.map(({ obs, key, tema }) => {
                          const obsState = obsStatus[key];
                          return (
                            <div key={key} style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.05)", borderRadius:"0 8px 8px 0", padding:"14px 16px", opacity:obsState?.status==="descartada"?0.5:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:6 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <CodigoBadge codigo={obs._codigo} size={11} />
                                  <span style={{ fontSize:12, fontWeight:700, color:"#C0392B" }}>{tema}</span>
                                </div>
                                {obsState?.status && <span style={{ fontSize:10, fontWeight:600, color:STATUS_COLORS[obsState.status], background:STATUS_COLORS[obsState.status]+"18", border:`1px solid ${STATUS_COLORS[obsState.status]}40`, borderRadius:4, padding:"1px 7px" }}>✓ {STATUS_LABELS[obsState.status]}</span>}
                              </div>
                              <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.6, marginBottom:8 }}>{obs.descripcion}</div>
                              {obs.articulo && <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>{obs.articulo.split(/[,;]/).map(p=>p.trim()).filter(Boolean).map((p,pi) => <span key={pi} style={{ fontSize:10, color:"#2952A3", background:"rgba(41,82,163,0.08)", border:"1px solid rgba(41,82,163,0.2)", borderRadius:4, padding:"2px 7px", fontFamily:"'DM Mono',monospace" }}>§ {p}</span>)}</div>}
                              {obs.correccion && <div style={{ fontSize:12, color:"#6B7A99", borderTop:"1px solid rgba(192,57,43,0.15)", paddingTop:8, lineHeight:1.5, marginBottom:8 }}><span style={{ color:"#C0392B", fontWeight:600 }}>→ </span>{obs.correccion}</div>}
                              <div style={{ display:"flex", gap:5, flexWrap:"wrap", paddingTop:8, borderTop:"1px solid rgba(0,0,0,0.06)" }}>
                                {OBS_ACTIONS.map(a => { const active=obsState?.status===a.id; return <button key={a.id} onClick={() => setObsAction(key, a.id)} style={{ padding:"3px 9px", fontSize:10, borderRadius:5, border:`1px solid ${active?a.color:"#D1D9EE"}`, background:active?a.color+"18":"transparent", color:active?a.color:"#6B7A99", cursor:"pointer", fontFamily:"inherit", fontWeight:active?700:400, transition:"all .15s" }}>{a.label}</button>; })}
                              </div>
                              {obsState?.status==="comentada" && <textarea value={obsState?.comment||""} onChange={e=>setObsComment(key,e.target.value)} placeholder="Escribe tu comentario..." style={{ marginTop:8, width:"100%", border:"1px solid #D1D9EE", borderRadius:6, padding:"8px 10px", fontSize:11, fontFamily:"inherit", color:"#3D4A5C", resize:"vertical", minHeight:60, outline:"none", background:"#FFFFFF" }} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {Object.keys(catGroups).length > 0 && (
                    <div style={{ marginBottom:28 }}>
                      <SectionTitle>🟡 Observaciones técnicas</SectionTitle>
                      {Object.entries(catGroups).map(([tema, items]) => (
                        <div key={tema} style={{ marginBottom:16 }}>
                          <div style={{ fontSize:10, color:"#6B7A99", letterSpacing:"1px", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontWeight:600 }}>{tema.toUpperCase()}</span>
                            <span style={{ background:"rgba(107,122,153,0.12)", borderRadius:99, padding:"1px 7px", fontSize:9 }}>{items.length}</span>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            {items.map(({ obs, key }) => <ObsCard key={key} obs={obs} obsKey={key} obsState={obsStatus[key]} onAction={setObsAction} onComment={setObsComment} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(result.analisis_por_archivo||[]).some(a => a.elementos_ok?.length) && (
                    <div style={{ marginBottom:28 }}>
                      <SectionTitle>📄 Resumen por documento</SectionTitle>
                      {(result.analisis_por_archivo||[]).map((doc,i) => {
                        if (!doc.elementos_ok?.length) return null;
                        const est = estadoDocStyle(doc.estado);
                        return (
                          <div key={i} style={{ background:"#F4F6FB", border:"1px solid #D1D9EE", borderRadius:10, marginBottom:10, overflow:"hidden" }}>
                            <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                              <span style={{ fontSize:14 }}>{doc.archivo?.match(/\.(jpg|jpeg|png)/i)?"🖼":"📄"}</span>
                              <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:13, color:"#1B3A8A", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{doc.archivo}</div><div style={{ fontSize:11, color:"#6B7A99" }}>{doc.tipo_detectado}</div></div>
                              <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:99, ...est }}>{doc.estado}</span>
                            </div>
                            <div style={{ padding:"10px 14px", borderTop:"1px solid #D1D9EE" }}>
                              <div style={{ fontSize:9, color:"#1E8449", letterSpacing:"2px", marginBottom:7 }}>CUMPLE ✓</div>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>{doc.elementos_ok.map((ok,j) => <span key={j} style={{ fontSize:11, color:"#1E8449", background:"rgba(30,132,73,0.08)", border:"1px solid rgba(30,132,73,0.25)", borderRadius:6, padding:"3px 10px" }}>{ok}</span>)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {result.pasos_siguientes?.length > 0 && (
                    <div style={{ marginBottom:26 }}>
                      <SectionTitle>✅ Plan de acción prioritario</SectionTitle>
                      <div style={{ border:"1px solid #D1D9EE", borderRadius:10, overflow:"hidden" }}>
                        {result.pasos_siguientes.map((p,i) => (
                          <div key={i} style={{ display:"grid", gridTemplateColumns:"40px 1fr", gap:12, padding:"10px 14px", borderTop:i>0?"1px solid #EEF2FB":"none", alignItems:"flex-start" }}>
                            <div style={{ width:24, height:24, borderRadius:"50%", background:i===0?"#C0392B":i===1?"#D68910":"#2952A3", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff" }}>{i+1}</div>
                            <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.6 }}>{p}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.alertas_especiales?.filter(a => a?.trim()).length > 0 && (
                    <div style={{ marginBottom:26 }}>
                      <SectionTitle>⚡ Alertas especiales</SectionTitle>
                      {result.alertas_especiales.filter(a => a?.trim()).map((a,i) => <div key={i} style={{ background:"#FEF3CD", border:"1px solid #D68910", borderRadius:8, padding:"11px 14px", marginBottom:6, fontSize:13, color:"#7D5A00", lineHeight:1.6 }}>⚠ {a}</div>)}
                    </div>
                  )}
                  <div style={{ marginBottom:22 }}>
                    <SectionTitle>RESUMEN DE VERIFICACIÓN</SectionTitle>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {[
                        { label:"Normativa OGUC verificada", ok:true },
                        { label:"Normativa LGUC verificada", ok:true },
                        { label:tienePRC?`PRC ${PRC_COMUNAS[comuna].meta.nombre} aplicado`:"PRC — comuna no registrada", ok:tienePRC },
                        { label:totalRecintos>0?`${totalRecintos} recinto${totalRecintos!==1?"s":""} identificado${totalRecintos!==1?"s":""}`:"Recintos — no detectados", ok:totalRecintos>0 },
                        { label:"Incumplimientos críticos", ok:altas.length===0 },
                      ].map(item => <div key={item.label} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:"#3D4A5C" }}><span style={{ fontSize:14, flexShrink:0 }}>{item.ok?"✅":"⚠️"}</span><span style={{ color:item.ok?"#1E8449":"#D68910" }}>{item.label}</span></div>)}
                    </div>
                  </div>
                  <div style={{ background:"#EEF2FB", border:"1px solid #D1D9EE", borderRadius:8, padding:"12px 16px", fontSize:11, color:"#6B7A99", lineHeight:1.7, marginBottom:18 }}>
                    ⚠ Análisis orientativo. No reemplaza la revisión oficial de la DOM. Consulte siempre el Plan Regulador Comunal y la DOM de su comuna.
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={resetApp} style={{ flex:1, padding:"13px", background:"#FFFFFF", border:"1px solid #D1D9EE", borderRadius:10, color:"#2952A3", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>↩ Nuevo análisis</button>
                    <button onClick={exportPDF} style={{ flex:1, padding:"13px", background:"linear-gradient(90deg,#1B3A8A,#2952A3)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>🖨 Exportar informe</button>
                  </div>
                </div>
              );
            })()}

            </div>{/* /content */}
          </div>
        )}
      </main>


      {/* Toast de confirmación */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: toast === "aceptada" ? "#1E8449" : toast === "comentada" ? "#2952A3" : toast === "modificada" ? "#D68910" : "#6B7A99", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", zIndex: 9999, display: "flex", alignItems: "center", gap: 8 }}>
          {toast === "aceptada" ? "✅ Observación aceptada" : toast === "comentada" ? "💬 Comentario guardado" : toast === "modificada" ? "✏️ Marcada para modificar" : "🗑️ Observación descartada"}
        </div>
      )}

      {/* PrintReport — siempre en DOM para que cloneNode tenga el HTML completo */}
      {result && (
        <div ref={printRef} style={{ position:"absolute", left:"-9999px", top:0, width:"210mm", pointerEvents:"none" }}>
          <PrintReport
            result={result}
            obsStatus={obsStatus}
            tipo={tipo}
            comuna={comuna}
            archivos={archivos}
            colabPngs={colabPngs}
            verificadorResult={verificadorResult}
            fichaProyecto={fichaProyecto}
          />
        </div>
      )}
    </div>
  );
}

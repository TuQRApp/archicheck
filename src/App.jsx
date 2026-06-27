import { useState, useRef, useCallback, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import SelectorComuna from './components/SelectorComuna.jsx';
import CropModal from './components/CropModal.jsx';
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

const ESCALAS = ["1:25","1:50","1:75","1:100","1:150","1:200","1:250","1:500","1:1000","1:2000"];
const TIPOS_DOC_CON_ESCALA = ["Planta arquitectura","Cortes y elevaciones","Plano de emplazamiento"];

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

function getAllObs(result) {
  if (!result) return [];
  return [
    { prefix:"sep", arr:result.capa1?.separacion?.observaciones,              etapa:"Separación" },
    { prefix:"rec", arr:result.capa1?.reconocimiento?.observaciones,          etapa:"Reconocimiento" },
    { prefix:"vec", arr:result.capa1?.vectorizacion?.observaciones,           etapa:"Vectorización" },
    { prefix:"mod", arr:result.capa1?.modelo?.observaciones,                  etapa:"Modelo" },
    { prefix:"n1",  arr:result.capa2?.recintos_superficies?.observaciones,    etapa:"Recintos" },
    { prefix:"n2",  arr:result.capa2?.circulaciones?.observaciones,           etapa:"Circulaciones" },
    { prefix:"n3",  arr:result.capa2?.iluminacion_ventilacion?.observaciones, etapa:"Iluminación" },
    { prefix:"n4",  arr:result.capa2?.normativa_urbanistica?.observaciones,   etapa:"Urbanística" },
  ].flatMap(({ prefix, arr, etapa }) =>
    (arr || []).map((obs, i) => ({ obs, key:`${prefix}-${i}`, etapa }))
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
  const fields = ["resumen_general","puntaje_global","estado_global","documentos_faltantes","analisis_por_archivo","alertas_especiales","pasos_siguientes","capa1","capa2"];
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
  if (typeof partial.puntaje_global !== "number") partial.puntaje_global = 0;
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

// ── Merge de resultados de dos modelos ──────────────────────────────────────
function mergeResults(r1, r2) {
  const STOP = new Set(["el","la","los","las","un","una","de","del","en","y","o","a","se","que","es","no","con","por","para","al","lo","su","sus"]);

  function wordsOf(s) {
    return new Set((s || "").toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP.has(w)));
  }
  function similar(a, b) {
    const wa = wordsOf(a.descripcion), wb = wordsOf(b.descripcion);
    let n = 0; wb.forEach(w => { if (wa.has(w)) n++; });
    return n >= 3;
  }
  function mergeObs(a = [], b = []) {
    const out = [...a];
    for (const obs of b) if (!out.some(ex => similar(ex, obs))) out.push(obs);
    return out;
  }
  function dedupeArr(a = [], b = []) {
    const seen = new Set(a.map(s => String(s).trim().toLowerCase()));
    return [...a, ...b.filter(s => !seen.has(String(s).trim().toLowerCase()))];
  }
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

  const rec1 = r1.capa1?.reconocimiento || {}, rec2 = r2.capa1?.reconocimiento || {};
  const recSec = mergeSection(rec1, rec2, "recintos_por_nivel");
  recSec.stats = {
    recintos_total: Math.max(rec1.stats?.recintos_total || 0, rec2.stats?.recintos_total || 0),
    niveles:        Math.max(rec1.stats?.niveles        || 0, rec2.stats?.niveles        || 0),
    observaciones:  recSec.observaciones?.length || 0,
  };

  return {
    puntaje_global:       Math.round(((r1.puntaje_global || 0) + (r2.puntaje_global || 0)) / 2),
    estado_global:        estado,
    resumen_general:      (r1.resumen_general?.length || 0) >= (r2.resumen_general?.length || 0) ? r1.resumen_general : r2.resumen_general,
    analisis_por_archivo: (r1.analisis_por_archivo?.length || 0) >= (r2.analisis_por_archivo?.length || 0) ? (r1.analisis_por_archivo || []) : (r2.analisis_por_archivo || []),
    documentos_faltantes: dedupeArr(r1.documentos_faltantes, r2.documentos_faltantes),
    alertas_especiales:   dedupeArr(r1.alertas_especiales,   r2.alertas_especiales),
    pasos_siguientes:     dedupeArr(r1.pasos_siguientes,     r2.pasos_siguientes).slice(0, 6),
    capa1: {
      separacion:     mergeSection(r1.capa1?.separacion     || {}, r2.capa1?.separacion     || {}, "capas"),
      reconocimiento: recSec,
      vectorizacion:  mergeSection(r1.capa1?.vectorizacion  || {}, r2.capa1?.vectorizacion  || {}, "elementos"),
      modelo:         mergeSection(r1.capa1?.modelo         || {}, r2.capa1?.modelo         || {}, null),
    },
    capa2: {
      recintos_superficies:   mergeSection(r1.capa2?.recintos_superficies   || {}, r2.capa2?.recintos_superficies   || {}, "tabla"),
      circulaciones:           mergeSection(r1.capa2?.circulaciones           || {}, r2.capa2?.circulaciones           || {}, "tabla"),
      iluminacion_ventilacion: mergeSection(r1.capa2?.iluminacion_ventilacion || {}, r2.capa2?.iluminacion_ventilacion || {}, "tabla"),
      normativa_urbanistica:   mergeSection(r1.capa2?.normativa_urbanistica   || {}, r2.capa2?.normativa_urbanistica   || {}, "tabla"),
    },
  };
}

// ── Colab JSON → texto para el prompt ──────────────────────────────────────
function buildColabTexto(json) {
  if (!json) return "";
  if (json.paginas) {
    const lines = ["\nMEDICIÓN GEOMÉTRICA REAL (Colab/OpenCV, medida desde píxeles reales):"];
    for (const p of json.paginas) {
      lines.push(`Página ${p.pagina} — escala ${p.escala} — área total medida: ${p.total_area_m2} m²:`);
      const named = (p.mediciones_geometricas || []).filter(r => !r.nombre.startsWith("Espacio E"));
      for (const r of named) {
        const a = r.ancho_min_m != null ? ` · ancho mín ${r.ancho_min_m} m` : "";
        const e = r.cumple_geo === false ? " [INCUMPLE OGUC]" : "";
        lines.push(`  - ${r.nombre} (${r.tipo}): ${r.area_m2} m²${a}${e}`);
      }
      for (const inc of (p.incumplimientos_geo || [])) {
        const u = inc.tipo === "area" ? "m²" : "m";
        lines.push(`  INCUMPLIMIENTO CONFIRMADO [${inc.tipo.toUpperCase()}] ${inc.recinto}: ${inc.medido}${u} < ${inc.minimo}${u} mínimo — ${inc.ref} — déficit ${inc.deficit}${u}`);
      }
    }
    const totalInc = json.resumen_global?.incumplimientos_geo_total ?? 0;
    if (totalInc > 0)
      lines.push(`\nLos ${totalInc} incumplimientos marcados son MEDIDAS REALES confirmadas por OpenCV. Inclúyelos como observaciones ALTA criticidad.\n`);
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

// ── Prompt ─────────────────────────────────────────────────────────────────
function buildPrompt(tipo, comuna, archivos, modo = "parcial", preguntas = {}, colabData = null) {
  const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || tipo;
  const lista = archivos.map((f, i) => {
    const selCount = f.paginasSeleccionadas?.length ?? f.pdfImages?.length ?? 0;
    const tag = f.pdfImages?.length
      ? `${selCount} pág. seleccionada${selCount !== 1 ? "s" : ""} de ${f.pdfImages[0].total} adjunta${selCount !== 1 ? "s" : ""} como imagen`
      : f.isImage ? "imagen adjunta"
      : "[formato no visual — sin contenido extraíble]";
    let escalaInfo = "";
    if (f.escalasMultiples && f.escalasPorPagina?.some(ep => ep.capturas?.some(c => c.escala))) {
      escalaInfo = " — Escalas por sección: " + f.escalasPorPagina
        .flatMap(ep => ep.capturas.filter(c => c.escala).map(c => `pág.${ep.pagina} "${c.nombre || "sección"}"=${c.escala}`))
        .join(", ");
    } else if (f.escala) {
      escalaInfo = ` — Escala: ${f.escala}`;
    }
    return `Archivo ${i + 1}: "${f.name}" (${f.tipoDoc || "sin clasificar"}) — ${tag}${escalaInfo}`;
  }).join("\n\n---\n\n");

  // Artículos OGUC clave para el análisis
  const ogucTexto = Object.entries(ogucArticulos.articulos)
    .map(([num, art]) => `Art. ${num} (${art.tema}): ${art.texto.substring(0, 300)}`)
    .join("\n");

  // Artículos LGUC clave
  const lgucTexto = Object.entries(lgucArticulos.articulos)
    .map(([num, art]) => `Art. ${num} (${art.tema}): ${art.texto.substring(0, 300)}`)
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

Usa la normativa anterior como base de tu análisis. Cita el artículo exacto de OGUC, LGUC o la circular DDU correspondiente cuando detectes cumplimiento o incumplimiento.
${contextoTexto}Analiza solo los archivos adjuntos. No penalices por documentos no subidos.

Para cada planta de arquitectura identifica los recintos visibles con bbox como fraccion de la imagen (bbox:[x1,y1,x2,y2] donde 0,0 es esquina superior-izquierda y 1,1 inferior-derecha). Si no puedes estimar coordenadas confiables para un recinto, omite bbox.
${buildColabTexto(colabData)}
Responde SOLO con JSON puro sin markdown. Esquema completo:
{"resumen_general":"...","puntaje_global":0,"estado_global":"APROBABLE|OBSERVADO|RECHAZABLE","capa1":{"separacion":{"capas":[{"nombre":"...","contenido":"...","paginas":"...","estado":"OK|OBSERVADO"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"reconocimiento":{"stats":{"recintos_total":0,"niveles":0},"recintos_por_nivel":[{"nivel":"...","recintos":[{"nombre":"...","uso":"...","superficie_m2":0,"estado":"OK|OBSERVADO|INCUMPLE"}]}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"vectorizacion":{"elementos":[{"tipo":"...","cantidad":0,"descripcion":"...","paginas":"...","estado":"OK|OBSERVADO"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"modelo":{"organizacion_funcional":[{"nivel":"...","uso":"...","area_m2":0,"conexion":"..."}],"accesos_evacuacion":[{"elemento":"...","estado":"OK|OBSERVADO|INCUMPLE","nota":"..."}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]}},"capa2":{"recintos_superficies":{"tabla":[{"recinto":"...","uso":"...","sup_real_m2":0,"sup_minima_m2":0,"cumple":"SI|NO|VERIFICAR","articulo":"..."}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"circulaciones":{"tabla":[{"elemento":"...","ancho_real_m":0,"ancho_minimo_m":0,"articulo":"...","cumple":"SI|NO|VERIFICAR"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"iluminacion_ventilacion":{"tabla":[{"recinto":"...","area_ventana_m2":0,"area_recinto_m2":0,"ratio_requerido":"1/6","cumple":"SI|NO|VERIFICAR"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]},"normativa_urbanistica":{"tabla":[{"parametro":"...","referencia":"...","valor_proyecto":"...","estado":"OK|OBSERVADO|INCUMPLE"}],"observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}]}},"analisis_por_archivo":[{"archivo":"...","tipo_detectado":"...","estado":"OK|CON OBSERVACIONES|INCOMPLETO|NO LEGIBLE","elementos_ok":["..."],"recintos":[{"nombre":"...","uso":"...","superficie_m2":0,"pagina":1,"bbox":[0.1,0.1,0.5,0.5],"estado":"OK|OBSERVADO|INCUMPLE","observacion":"..."}]}],"alertas_especiales":["..."],"pasos_siguientes":["..."]}`;
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

// ── Componentes de resultados ───────────────────────────────────────────────
function SectionTitle({ children }) {
  return <h3 style={{ fontSize:14, fontWeight:700, color:"#1B3A8A", margin:"0 0 12px", paddingBottom:8, borderBottom:"2px solid #EEF2FB", display:"flex", alignItems:"center", gap:8 }}>{children}</h3>;
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
        <div style={{ fontSize:13, color:"#3D4A5C", lineHeight:1.5, flex:1 }}>{obs.descripcion}</div>
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

function ObsSection({ obs, prefix, obsStatus, onAction, onComment }) {
  if (!obs?.length) return null;
  return (
    <div style={{ marginTop:20 }}>
      <SectionTitle>⚠️ Observaciones — {obs.length}</SectionTitle>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {obs.map((o,i) => <ObsCard key={i} obs={o} obsKey={`${prefix}-${i}`} obsState={obsStatus[`${prefix}-${i}`]} onAction={onAction} onComment={onComment} />)}
      </div>
    </div>
  );
}

// ── PrintReport — layout dedicado para PDF ──────────────────────────────────
function PrintReport({ result, obsStatus, tipo, comuna, archivos, colabPngs }) {
  const ec = globalStyle(result.estado_global);
  const tienePRC = !!PRC_COMUNAS[comuna];
  const todas = getAllObs(result);
  const altas = todas.filter(x => x.obs.criticidad === "ALTA");
  const tecnicas = todas.filter(x => x.obs.criticidad !== "ALTA");
  const resueltas = Object.values(obsStatus).filter(s => s?.status).length;
  const total = todas.length;
  const totalRecintos = (result.capa1?.reconocimiento?.recintos_por_nivel || [])
    .reduce((acc, n) => acc + (n.recintos?.length || 0), 0);

  const PTH = { padding:"5px 9px", textAlign:"left", color:"#fff", fontWeight:700, fontSize:9, background:"#1B3A8A", whiteSpace:"nowrap" };
  const PTD = { padding:"5px 9px", borderBottom:"1px solid #e8ecf5", fontSize:10, color:"#2d3748", verticalAlign:"top" };

  function ObsPrint({ arr, prefix }) {
    if (!arr?.length) return null;
    return (
      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:8, fontWeight:700, color:"#6B7A99", letterSpacing:"1.5px", marginBottom:6 }}>OBSERVACIONES — {arr.length}</div>
        {arr.map((obs, i) => {
          const key = `${prefix}-${i}`;
          const st = obsStatus[key];
          const cs = critStyle(obs.criticidad);
          return (
            <div key={i} className="obs-no-break" style={{ ...cs, borderRadius:5, padding:"8px 10px", marginBottom:5, pageBreakInside:"avoid", breakInside:"avoid" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:3 }}>
                <div style={{ fontSize:10, color:"#3D4A5C", lineHeight:1.4, flex:1 }}>{obs.descripcion}</div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:2, flexShrink:0 }}>
                  <span style={{ fontSize:8, fontWeight:700, color:cs.color, background:cs.background, border:cs.border, borderRadius:99, padding:"1px 5px" }}>{obs.criticidad}</span>
                  {st?.status && <span style={{ fontSize:8, fontWeight:600, color:STATUS_COLORS[st.status], background:STATUS_COLORS[st.status]+"18", border:`1px solid ${STATUS_COLORS[st.status]}40`, borderRadius:99, padding:"1px 5px" }}>✓ {STATUS_LABELS[st.status]}</span>}
                </div>
              </div>
              {obs.articulo && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginBottom: obs.correccion ? 5 : 0 }}>
                  {obs.articulo.split(/[,;]/).map(p => p.trim()).filter(Boolean).map((p, pi) => (
                    <span key={pi} style={{ fontSize:8, color:"#2952A3", background:"rgba(41,82,163,0.08)", border:"1px solid rgba(41,82,163,0.2)", borderRadius:3, padding:"1px 4px", fontFamily:"monospace" }}>§ {p}</span>
                  ))}
                </div>
              )}
              {obs.correccion && <div style={{ fontSize:9, color:"#6B7A99", borderTop:"1px solid rgba(0,0,0,0.08)", paddingTop:5, lineHeight:1.4 }}><span style={{ color:"#2952A3", fontWeight:700 }}>→ </span>{obs.correccion}</div>}
              {st?.comment && <div style={{ fontSize:9, color:"#2952A3", marginTop:3, fontStyle:"italic" }}>Nota: {st.comment}</div>}
            </div>
          );
        })}
      </div>
    );
  }

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
            <div style={{ marginTop:6 }}>
              <span style={{ fontSize:44, fontWeight:900, fontFamily:"Arial,sans-serif", color:ec.color, lineHeight:1 }}>{result.puntaje_global}</span>
              <span style={{ fontSize:13, color:"#6B7A99" }}>/100</span>
            </div>
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
        <div style={{ background:"#EEF2FB", borderRadius:99, height:5, marginBottom:6, overflow:"hidden" }}>
          <div style={{ width:`${result.puntaje_global}%`, height:"100%", borderRadius:99, background:`linear-gradient(90deg,${ec.color}80,${ec.color})` }}/>
        </div>
        <p style={{ fontSize:11, color:"#3D4A5C", lineHeight:1.7, marginBottom:20 }}>{result.resumen_general}</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
          {[
            { n:altas.length,    label:"Incumplimientos", c:"#C0392B" },
            { n:tecnicas.length, label:"Observaciones",   c:"#D68910" },
            { n:resueltas,       label:"Resueltas",        c:"#1E8449" },
          ].map(m => (
            <div key={m.label} style={{ border:`1px solid ${m.c}30`, borderRadius:8, padding:"10px", textAlign:"center", background:`${m.c}06` }}>
              <div style={{ fontSize:28, fontWeight:900, color:m.c, lineHeight:1 }}>{m.n}</div>
              <div style={{ fontSize:9, color:"#6B7A99", marginTop:2 }}>{m.label}</div>
            </div>
          ))}
        </div>
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
        <ObsPrint arr={result.capa1?.separacion?.observaciones} prefix="sep" />

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
                    <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{r.nombre}</td>
                    <td style={PTD}>{r.uso || "—"}</td>
                    <td style={PTD}>{r.superficie_m2 ?? "—"}</td>
                    <td style={PTD}><StatusBadge val={r.estado} /></td>
                  </tr>
                ))}
              />
            </div>
          ))}
          <ObsPrint arr={result.capa1?.reconocimiento?.observaciones} prefix="rec" />
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
          <ObsPrint arr={result.capa1?.vectorizacion?.observaciones} prefix="vec" />
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
          <ObsPrint arr={result.capa1?.modelo?.observaciones} prefix="mod" />
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
        <ObsPrint arr={result.capa2?.recintos_superficies?.observaciones} prefix="n1" />

        {/* N2 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa B — Circulaciones" subtitle="Verificación de anchos mínimos de pasillos, escaleras y accesos según OGUC" badge="Capa 2 · B/D" c2 />
          <PrintTable
            headers={["Elemento","Ancho real (m)","Ancho mín. (m)","Artículo","Cumple"]}
            rows={(result.capa2?.circulaciones?.tabla || []).map((r, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{r.elemento}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ancho_real_m ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ancho_minimo_m ?? "—"}</td>
                <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{r.articulo || "—"}</td>
                <td style={PTD}><StatusBadge val={r.cumple} /></td>
              </tr>
            ))}
          />
          <ObsPrint arr={result.capa2?.circulaciones?.observaciones} prefix="n2" />
        </div>

        {/* N3 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa C — Iluminación y Ventilación" subtitle="Verificación de relación ventana/área de recinto según OGUC Art. 4.5.7" badge="Capa 2 · C/D" c2 />
          <PrintTable
            headers={["Recinto","Área ventana m²","Área recinto m²","Ratio req.","Cumple"]}
            rows={(result.capa2?.iluminacion_ventilacion?.tabla || []).map((r, i) => (
              <tr key={i} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A" }}>{r.recinto}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.area_ventana_m2 ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.area_recinto_m2 ?? "—"}</td>
                <td style={{ ...PTD, textAlign:"center" }}>{r.ratio_requerido || "1/6"}</td>
                <td style={PTD}><StatusBadge val={r.cumple} /></td>
              </tr>
            ))}
          />
          <ObsPrint arr={result.capa2?.iluminacion_ventilacion?.observaciones} prefix="n3" />
        </div>

        {/* N4 */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa D — Normativa Urbanística" subtitle="Verificación de constructibilidad, altura, COS y uso de suelo" badge="Capa 2 · D/D" c2 />
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
          <ObsPrint arr={result.capa2?.normativa_urbanistica?.observaciones} prefix="n4" />
        </div>

        {/* N5 — Consolidación */}
        <div style={pg}>
          <CapaBanner>CAPA 2 — EVALUACIÓN NORMATIVA</CapaBanner>
          <EtapaTitle label="Etapa E — Consolidación" subtitle="Revisión final de todas las observaciones" badge="Capa 2 · E/E" c2 />
          {altas.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#C0392B", letterSpacing:"1.5px", marginBottom:8 }}>INCUMPLIMIENTOS — {altas.length}</div>
              {altas.map(({ obs, key, etapa }) => {
                const st = obsStatus[key];
                return (
                  <div key={key} className="obs-no-break" style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.04)", borderRadius:"0 6px 6px 0", padding:"8px 10px", marginBottom:6, pageBreakInside:"avoid", breakInside:"avoid" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:8, marginBottom:3 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:"#C0392B" }}>{etapa}</div>
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
                <thead><tr>{["Etapa","Descripción","Criticidad","Artículo"].map(h => <th key={h} style={PTH}>{h}</th>)}</tr></thead>
                <tbody>{tecnicas.map(({ obs, key, etapa }, i) => (
                  <tr key={key} style={{ background:i%2===0?"#fff":"#f8f9ff" }}>
                    <td style={{ ...PTD, fontWeight:700, color:"#1B3A8A", whiteSpace:"nowrap" }}>{etapa}</td>
                    <td style={PTD}>{obs.descripcion}</td>
                    <td style={PTD}><StatusBadge val={obs.criticidad === "ALTA" ? "INCUMPLE" : obs.criticidad === "MEDIA" ? "OBSERVADO" : "OK"} /></td>
                    <td style={{ ...PTD, fontFamily:"monospace", fontSize:9, color:"#2952A3" }}>{obs.articulo || "—"}</td>
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
      <div style={pg}>
        <CapaBanner>★ INFORME FINAL</CapaBanner>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, gap:12 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, color:"#1B3A8A", fontFamily:"Arial,sans-serif", margin:"0 0 2px" }}>{TIPOS.find(t => t.id === tipo)?.label} · {PRC_COMUNAS[comuna]?.meta?.nombre || comuna}</h2>
            <div style={{ fontSize:10, color:"#6B7A99" }}>{new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <span style={{ fontSize:8, fontWeight:700, padding:"3px 12px", borderRadius:99, ...ec }}>{result.estado_global}</span>
            <div><span style={{ fontSize:32, fontWeight:900, color:ec.color, lineHeight:1 }}>{result.puntaje_global}</span><span style={{ fontSize:11, color:"#6B7A99" }}>/100</span></div>
          </div>
        </div>
        <p style={{ fontSize:11, color:"#3D4A5C", lineHeight:1.7, marginBottom:16 }}>{result.resumen_general}</p>
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
        {result.alertas_especiales?.length > 0 && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#D68910", letterSpacing:"1.5px", marginBottom:6 }}>ALERTAS ESPECIALES</div>
            {result.alertas_especiales.map((a, i) => (
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
  const [result,     setResult]     = useState(null);
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
  const [toast, setToast] = useState(null);
  const [activeEtapa, setActiveEtapa] = useState("e1");
  const [activeFloor, setActiveFloor] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [cropModal, setCropModal] = useState(null);
  const inputRef = useRef();
  const colabInputRef = useRef();
  const colabPngInputRef = useRef();
  const printRef = useRef();

  function exportPDF() {
    if (!printRef.current) return;

    const slug = TIPOS.find(t => t.id === tipo)?.label?.replace(/\s+/g, "-").toLowerCase() || "informe";
    const fecha = new Date().toISOString().slice(0, 10);

    // Abre el informe en una nueva pestaña y dispara window.print() automáticamente.
    // Usa el renderer nativo del browser — sin html2canvas, sin canvas blancos.
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>ArchiCheck — ${slug} — ${fecha}</title>
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
        escala: "",
        escalasMultiples: false,
        escalasPorPagina: pdfImages?.map(img => ({ pagina: img.page, capturas: [] })) ?? [],
      };
    }));
    setArchivos(prev => [...prev, ...procesados]);
  }, []);

  const removeFile   = (i) => setArchivos(prev => prev.filter((_, idx) => idx !== i));
  const setTipoDoc   = (i, v) => setArchivos(prev => prev.map((f, idx) => idx === i ? { ...f, tipoDoc: v } : f));
  const setEscala    = (i, v) => setArchivos(prev => prev.map((f, idx) => idx === i ? { ...f, escala: v } : f));
  const toggleEscalasMultiples = (i) => setArchivos(prev => prev.map((f, idx) =>
    idx === i ? { ...f, escalasMultiples: !f.escalasMultiples } : f
  ));
  const removeCaptura = (fileIdx, pagina, ci) => setArchivos(prev => prev.map((f, idx) => {
    if (idx !== fileIdx) return f;
    return { ...f, escalasPorPagina: f.escalasPorPagina.map(ep =>
      ep.pagina === pagina ? { ...ep, capturas: ep.capturas.filter((_, j) => j !== ci) } : ep
    )};
  }));
  function saveCrop(fileIdx, crop) {
    setArchivos(prev => prev.map((f, idx) => {
      if (idx !== fileIdx) return f;
      let eps = f.escalasPorPagina;
      if (!eps.some(ep => ep.pagina === crop.pagina)) {
        eps = [...eps, { pagina: crop.pagina, capturas: [] }].sort((a, b) => a.pagina - b.pagina);
      }
      return { ...f, escalasPorPagina: eps.map(ep =>
        ep.pagina === crop.pagina ? { ...ep, capturas: [...ep.capturas, crop] } : ep
      )};
    }));
  }
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
      setError("");
    } catch (e) {
      setError("No se pudo leer el JSON de Colab: " + e.message);
    }
  }

  async function handleColabPngs(files) {
    if (!files?.length) return;
    const nuevos = await Promise.all(Array.from(files).map(async (f) => ({
      name: f.name,
      base64: await compressImage(f),
    })));
    setColabPngs(prev => [...prev, ...nuevos]);
  }

  function removeColabPng(i) {
    setColabPngs(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Análisis ───────────────────────────────────────────────────────────
  async function analizar() {
    if (!archivos.length) return;
    const faltanTipo = archivos.some(f => !f.tipoDoc);
    if (faltanTipo) { setSinTipo(true); setError("Asigna el tipo de documento a cada archivo antes de analizar."); return; }
    setSinTipo(false);
    setLoading(true); setError(""); setResult(null); setObsStatus({}); setActiveEtapa("e1");
    try {
      // Construir content (imágenes primero, luego el prompt)
      setProgress("Convirtiendo PDFs a imágenes...");
      const content = [];
      for (const f of archivos) {
        if (f.isImage && f.base64) {
          content.push({ type: "image", source: { type: "base64", media_type: f.type, data: f.base64 } });
          content.push({ type: "text", text: `[Imagen: "${f.name}" — ${f.tipoDoc || "plano"}${f.escala ? ` — escala: ${f.escala}` : ""}]` });
        }
        if (f.pdfImages?.length) {
          const pagSel = f.paginasSeleccionadas?.length ? f.paginasSeleccionadas : f.pdfImages.map(img => img.page);
          setProgress(`Renderizando ${f.name} (${pagSel.length} página${pagSel.length !== 1 ? "s" : ""})...`);
          const fullRes = await renderPdfPagesFullRes(f.file, pagSel);
          const totalPaginas = f.pdfImages[0].total;
          for (const img of fullRes) {
            const escalaPage = f.escalasMultiples
              ? (f.escalasPorPagina?.find(ep => ep.pagina === img.page)?.capturas?.find(c => c.escala)?.escala || "")
              : f.escala;
            content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
            content.push({ type: "text", text: `[PDF: "${f.name}" — página ${img.page}/${totalPaginas} — ${f.tipoDoc || "plano"}${escalaPage ? ` — escala: ${escalaPage}` : ""}]` });
          }
          if (f.escalasMultiples) {
            for (const ep of f.escalasPorPagina) {
              if (!pagSel.includes(ep.pagina)) continue;
              for (const c of ep.capturas) {
                if (!c.base64) continue;
                content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: c.base64 } });
                content.push({ type: "text", text: `[RECORTE: "${f.name}" — pág. ${ep.pagina} — sección "${c.nombre || "sin nombre"}" — posición x:${c.x_pct?.toFixed(0) ?? "?"}% y:${c.y_pct?.toFixed(0) ?? "?"}% tamaño ${c.w_pct?.toFixed(0) ?? "?"}%×${c.h_pct?.toFixed(0) ?? "?"}% — escala: ${c.escala || "no especificada"}]` });
              }
            }
          }
        }
      }
      for (const png of colabPngs) {
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: png.base64 } });
        content.push({ type: "text", text: `[COLAB PNG: "${png.name}" — segmentación OpenCV de recintos, áreas y anchos medidos desde píxeles reales]` });
      }
      content.push({ type: "text", text: buildPrompt(tipo, comuna, archivos, "parcial", preguntas, colabJson) });

      setProgress("Analizando contra normativa OGUC / LGUC...");
      // ragQuery separado del prompt instructivo para mejor precisión semántica del RAG
      const ragQuery = [
        tipo, comuna,
        preguntas.situacion || "",
        preguntas.analizarSituacion || "",
        preguntas.niveles || "",
      ].filter(Boolean).join(" ").substring(0, 500);
      const makeBody = m => JSON.stringify({ messages: [{ role: "user", content }], modelo: m, ragQuery });
      const [resp1, resp2] = await Promise.all([
        fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: makeBody("claude") }),
        fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: makeBody("gpt4o") }),
      ]);

      setProgress("Consolidando análisis...");
      const [s1, s2] = await Promise.allSettled([readModelStream(resp1), readModelStream(resp2)]);

      const r1 = s1.status === "fulfilled" ? repairAndParse(s1.value.replace(/```json|```/g, "").trim()) : null;
      const r2 = s2.status === "fulfilled" ? repairAndParse(s2.value.replace(/```json|```/g, "").trim()) : null;

      if (!r1 && !r2) throw new Error((s1.reason || s2.reason)?.message || "Error en ambos modelos de análisis");
      setResult(r1 && r2 ? mergeResults(r1, r2) : (r1 || r2));

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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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

                      {/* Sección escala — solo para PDFs con tipo relevante */}
                      {f.type === "application/pdf" && TIPOS_DOC_CON_ESCALA.includes(f.tipoDoc) && (
                        <div style={{ borderTop: "1px solid #D1D9EE", padding: "8px 12px 10px" }}>
                          {!f.escalasMultiples ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "1px" }}>ESCALA</span>
                              <select value={f.escala} onChange={e => setEscala(i, e.target.value)}
                                style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 5, padding: "3px 7px", color: "#3D4A5C", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                                <option value="">— seleccionar —</option>
                                {ESCALAS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              <button onClick={() => toggleEscalasMultiples(i)}
                                style={{ background: "rgba(74,114,196,0.07)", border: "1px solid #4A72C4", borderRadius: 5, padding: "4px 10px", color: "#2952A3", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                                Recortar secciones con escala distinta
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 10, color: "#D68910", letterSpacing: "1px" }}>RECORTES DE SECCIÓN</span>
                                <button onClick={() => toggleEscalasMultiples(i)}
                                  style={{ background: "none", border: "1px solid #D1D9EE", borderRadius: 5, padding: "2px 7px", color: "#6B7A99", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                                  Una sola escala
                                </button>
                              </div>
                              <button onClick={() => setCropModal({ fileIdx: i })}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#1B3A8A", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
                                ✂ Abrir herramienta de recorte
                              </button>
                              {f.escalasPorPagina.some(ep => ep.capturas.length > 0) ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                  {f.escalasPorPagina.flatMap(ep =>
                                    ep.capturas.map((c, ci) => ({ ...c, pagina: ep.pagina, ci }))
                                  ).map(({ pagina, nombre, escala, ci }, idx) => (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, background: "rgba(30,132,73,0.06)", border: "1px solid rgba(30,132,73,0.22)", borderRadius: 5, padding: "4px 9px" }}>
                                        <span style={{ fontSize: 10, color: "#1E8449" }}>✓</span>
                                        <span style={{ fontSize: 10, color: "#3D4A5C" }}>Pág.{pagina} — {nombre || "sin nombre"} — {escala || "sin escala"}</span>
                                      </div>
                                      <button onClick={() => removeCaptura(i, pagina, ci)}
                                        style={{ background: "none", border: "none", color: "#B8C5E0", cursor: "pointer", fontSize: 13, padding: "0 3px", lineHeight: 1 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 10, color: "#B8C5E0" }}>
                                  Sin recortes — usa la herramienta para recortar secciones del plano
                                </div>
                              )}
                            </div>
                          )}
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

            {/* Resultados Colab (opcional) */}
            <div style={{ marginBottom: 18, border: "1px solid #D1D9EE", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#F4F6FB", borderBottom: "1px solid #D1D9EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px" }}>RESULTADOS COLAB</span>
                <span style={{ fontSize: 10, color: "#B8C5E0" }}>opcional — medición geométrica OpenCV</span>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

                {/* JSON */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colabJson ? "#1E8449" : "#2952A3", background: colabJson ? "rgba(30,132,73,0.06)" : "#EEF2FB", border: `1px solid ${colabJson ? "rgba(30,132,73,0.35)" : "#D1D9EE"}`, borderRadius: 7, padding: "7px 13px", fontFamily: "inherit", transition: "all .15s" }}>
                    <input ref={colabInputRef} type="file" accept=".json" style={{ display: "none" }}
                      onChange={e => handleColabJson(e.target.files[0])} />
                    <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace" }}>.json</span>
                    {colabJson ? " ✓ cargado" : " — archicheck_geometrico.json"}
                  </label>
                  {colabJson && (
                    <>
                      <span style={{ fontSize: 11, color: "#6B7A99" }}>
                        {colabJson.paginas
                          ? `${colabJson.paginas.length} pág. · ${colabJson.resumen_global?.incumplimientos_geo_total ?? 0} incumplimientos`
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
                      {colabPngs.length ? ` ✓ ${colabPngs.length} imagen${colabPngs.length > 1 ? "es" : ""} cargada${colabPngs.length > 1 ? "s" : ""}` : " — archicheck_geometrico_pagN.png"}
                    </label>
                  </div>
                  {colabPngs.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                      {colabPngs.map((p, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(30,132,73,0.06)", border: "1px solid rgba(30,132,73,0.2)", borderRadius: 5, padding: "3px 8px 3px 6px" }}>
                          <span style={{ fontSize: 10, color: "#1E8449", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                          <button onClick={() => removeColabPng(i)}
                            style={{ background: "none", border: "none", color: "#B8C5E0", cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Botón analizar */}
            <button onClick={analizar}
              disabled={loading || !archivos.length}
              style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 600, letterSpacing: ".4px", cursor: loading || !archivos.length ? "not-allowed" : "pointer", transition: "all .2s", background: loading || !archivos.length ? "#B8C5E0" : "linear-gradient(90deg,#1B3A8A,#2952A3)", color: "#FFFFFF" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #B8C5E0", borderTop: "2px solid #1B3A8A", borderRadius: "50%", animation: "spin .7s linear infinite" }}/>
                  <span style={{ animation: "pulse 1.4s infinite" }}>{progress}</span>
                </span>
              ) : `Analizar ${archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? "s" : ""}` : "expediente"} →`}
            </button>

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
                <div style={{ display:"flex", alignItems:"flex-end", gap:6 }}>
                  <span style={{ fontSize:30, fontWeight:800, color:ec.color, lineHeight:1, fontFamily:"'Inter',sans-serif" }}>{result.puntaje_global}</span>
                  <span style={{ fontSize:12, color:"#6B7A99", marginBottom:3 }}>/100</span>
                  <span style={{ marginLeft:"auto", fontSize:9, fontWeight:700, padding:"3px 10px", borderRadius:99, ...ec }}>{result.estado_global}</span>
                </div>
                <div style={{ background:"#EEF2FB", borderRadius:99, height:4, marginTop:8, overflow:"hidden" }}>
                  <div style={{ width:`${result.puntaje_global}%`, height:"100%", borderRadius:99, background:`linear-gradient(90deg,${ec.color}80,${ec.color})`, transition:"width 1.2s ease" }} />
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
                  <ObsSection obs={d?.observaciones} prefix="sep" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                            <tbody>{(niveles[activeFloor].recintos||[]).map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.nombre}</td><td style={TD}>{r.uso||"—"}</td><td style={TD}>{r.superficie_m2??"—"}</td><td style={TD}><StatusBadge val={r.estado} /></td></tr>)}</tbody>
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
                  <ObsSection obs={d?.observaciones} prefix="rec" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                  <ObsSection obs={d?.observaciones} prefix="vec" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                  <ObsSection obs={d?.observaciones} prefix="mod" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                  <ObsSection obs={d?.observaciones} prefix="n1" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.elemento}</td><td style={{ ...TD, textAlign:"center" }}>{r.ancho_real_m??"—"}</td><td style={{ ...TD, textAlign:"center" }}>{r.ancho_minimo_m??"—"}</td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{r.articulo||"—"}</td><td style={TD}><StatusBadge val={r.cumple} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de circulaciones</p>}
                  <ObsSection obs={d?.observaciones} prefix="n2" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                  {d?.tabla?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Recinto","Área ventana m²","Área recinto m²","Ratio req.","Cumple"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.recinto}</td><td style={{ ...TD, textAlign:"center" }}>{r.area_ventana_m2??"—"}</td><td style={{ ...TD, textAlign:"center" }}>{r.area_recinto_m2??"—"}</td><td style={{ ...TD, textAlign:"center" }}>{r.ratio_requerido||"1/6"}</td><td style={TD}><StatusBadge val={r.cumple} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos de iluminación</p>}
                  <ObsSection obs={d?.observaciones} prefix="n3" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
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
                  <SectionTitle>🏙️ Marco normativo aplicable</SectionTitle>
                  {d?.tabla?.length ? (
                    <div style={{ overflowX:"auto", marginBottom:8 }}>
                      <table style={{ width:"100%", borderCollapse:"collapse" }}>
                        <thead><tr>{["Parámetro","Referencia normativa","Valor del proyecto","Estado"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                        <tbody>{d.tabla.map((r,i) => <tr key={i} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A" }}>{r.parametro}</td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{r.referencia}</td><td style={TD}>{r.valor_proyecto}</td><td style={TD}><StatusBadge val={r.estado} /></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p style={{ color:"#B8C5E0", fontSize:12 }}>Sin datos urbanísticos</p>}
                  <ObsSection obs={d?.observaciones} prefix="n4" obsStatus={obsStatus} onAction={setObsAction} onComment={setObsComment} />
                </div>
              );
            })()}

            {/* N5 — Consolidación */}
            {activeEtapa === "n5" && (() => {
              const todas = getAllObs(result);
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
                        {altas.map(({ obs, key, etapa }) => {
                          const obsState = obsStatus[key];
                          return (
                            <div key={key} style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.04)", borderRadius:"0 8px 8px 0", padding:"14px 16px", opacity:obsState?.status==="descartada"?0.5:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:6 }}>
                                <div style={{ fontSize:11, fontWeight:700, color:"#C0392B" }}>{etapa}</div>
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
                          <thead><tr>{["Etapa","Descripción","Criticidad","Artículo"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                          <tbody>{tecnicas.map(({ obs, key, etapa },i) => <tr key={key} style={{ background:i%2===0?"#fff":"#F8F9FF" }}><td style={{ ...TD, fontWeight:600, color:"#1B3A8A", whiteSpace:"nowrap" }}>{etapa}</td><td style={TD}>{obs.descripcion}</td><td style={TD}><StatusBadge val={obs.criticidad==="ALTA"?"INCUMPLE":obs.criticidad==="MEDIA"?"OBSERVADO":"OK"} /></td><td style={{ ...TD, fontFamily:"'DM Mono',monospace", fontSize:10, color:"#2952A3" }}>{obs.articulo||"—"}</td></tr>)}</tbody>
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
              const todas = getAllObs(result);
              const altas = todas.filter(x => x.obs.criticidad === "ALTA");
              const tecnicas = todas.filter(x => x.obs.criticidad !== "ALTA");
              const resueltas = Object.values(obsStatus).filter(s => s?.status).length;
              const total = todas.length;
              const tienePRC = !!PRC_COMUNAS[comuna];
              const totalRecintos = (result.capa1?.reconocimiento?.recintos_por_nivel||[]).reduce((acc,n)=>acc+(n.recintos?.length||0),0);
              const catGroups = {};
              for (const { obs, key, etapa } of tecnicas) {
                if (!catGroups[etapa]) catGroups[etapa] = [];
                catGroups[etapa].push({ obs, key });
              }
              return (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, gap:16, flexWrap:"wrap" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:9, color:"#6B7A99", letterSpacing:"3px", marginBottom:8 }}>INFORME DE REVISIÓN NORMATIVA</div>
                      <h2 style={{ fontFamily:"'Inter',sans-serif", fontSize:22, fontWeight:800, margin:"0 0 4px", color:"#1B3A8A" }}>{TIPOS.find(t=>t.id===tipo)?.label} · {PRC_COMUNAS[comuna]?.meta?.nombre||comuna}</h2>
                      <div style={{ fontSize:11, color:"#6B7A99" }}>{new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"long",year:"numeric"})}</div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:8, flexShrink:0 }}>
                      <span style={{ fontSize:10, fontWeight:700, letterSpacing:"1.5px", padding:"5px 16px", borderRadius:99, ...ec2 }}>{result.estado_global}</span>
                      <div><span style={{ fontSize:42, fontWeight:800, fontFamily:"'Inter',sans-serif", color:ec2.color, lineHeight:1 }}>{result.puntaje_global}</span><span style={{ fontSize:13, color:"#6B7A99" }}>/100</span></div>
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
                  <div style={{ background:"#EEF2FB", borderRadius:99, height:5, marginBottom:8, overflow:"hidden" }}><div style={{ width:`${result.puntaje_global}%`, height:"100%", borderRadius:99, background:`linear-gradient(90deg,${ec2.color}80,${ec2.color})`, transition:"width 1.2s ease" }}/></div>
                  <p style={{ fontSize:13, color:"#6B7A99", lineHeight:1.7, marginBottom:24 }}>{result.resumen_general}</p>
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
                        {altas.map(({ obs, key, etapa }) => {
                          const obsState = obsStatus[key];
                          return (
                            <div key={key} style={{ borderLeft:"4px solid #C0392B", background:"rgba(192,57,43,0.05)", borderRadius:"0 8px 8px 0", padding:"14px 16px", opacity:obsState?.status==="descartada"?0.5:1 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:6 }}>
                                <div style={{ fontSize:12, fontWeight:700, color:"#C0392B" }}>{etapa}</div>
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
                      {Object.entries(catGroups).map(([etapa, items]) => (
                        <div key={etapa} style={{ marginBottom:16 }}>
                          <div style={{ fontSize:10, color:"#6B7A99", letterSpacing:"1px", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontWeight:600 }}>{etapa.toUpperCase()}</span>
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
                  {result.alertas_especiales?.length > 0 && (
                    <div style={{ marginBottom:26 }}>
                      <SectionTitle>⚡ Alertas especiales</SectionTitle>
                      {result.alertas_especiales.map((a,i) => <div key={i} style={{ background:"#FEF3CD", border:"1px solid #D68910", borderRadius:8, padding:"11px 14px", marginBottom:6, fontSize:13, color:"#7D5A00", lineHeight:1.6 }}>⚠ {a}</div>)}
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
                    <button onClick={() => { setResult(null); setArchivos([]); }} style={{ flex:1, padding:"13px", background:"#FFFFFF", border:"1px solid #D1D9EE", borderRadius:10, color:"#2952A3", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>↩ Nuevo análisis</button>
                    <button onClick={exportPDF} style={{ flex:1, padding:"13px", background:"linear-gradient(90deg,#1B3A8A,#2952A3)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>🖨 Exportar informe</button>
                  </div>
                </div>
              );
            })()}

            </div>{/* /content */}
          </div>
        )}
      </main>

      {/* CropModal */}
      {cropModal && (
        <CropModal
          file={archivos[cropModal.fileIdx].file}
          onSave={(crop) => saveCrop(cropModal.fileIdx, crop)}
          onClose={() => setCropModal(null)}
        />
      )}

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
          />
        </div>
      )}
    </div>
  );
}

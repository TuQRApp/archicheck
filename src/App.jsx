import { useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import SelectorComuna from './components/SelectorComuna.jsx';
import ogucArticulos from "../normativa/nacional/oguc_articulos.json";
import lgucArticulos from "../normativa/nacional/lguc_articulos.json";
import ley19300Articulos from "../normativa/nacional/ley19300_articulos.json";
import reglasNacionales from "../normativa/nacional/reglas_verificacion.json";
import nunoa_normas from "../normativa/nunoa/normas_edificacion.json";
import nunoa_meta from "../normativa/nunoa/metadata.json";
import santiago_normas from "../normativa/santiago/normas_edificacion.json";
import santiago_meta from "../normativa/santiago/metadata.json";

const PRC_COMUNAS = {
  nunoa:    { meta: nunoa_meta,    normas: nunoa_normas },
  santiago: { meta: santiago_meta, normas: santiago_normas },
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
  const fields = ["resumen_general","puntaje_global","estado_global","documentos_faltantes","analisis_por_archivo","alertas_especiales","pasos_siguientes"];
  for (const field of fields) {
    const m = str.match(new RegExp(`"${field}"\\s*:\\s*("([^"\\\\]|\\\\.)*"|\\d+|\\[|\\{)`));
    if (m) {
      try {
        // Intenta extraer el valor completo buscando su cierre
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
  return partial;
}

// ── Prompt ─────────────────────────────────────────────────────────────────
function buildPrompt(tipo, comuna, archivos, modo = "parcial", preguntas = {}) {
  const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || tipo;
  const lista = archivos.map((f, i) => {
    const selCount = f.paginasSeleccionadas?.length ?? f.pdfImages?.length ?? 0;
    const tag = f.pdfImages?.length
      ? `${selCount} pág. seleccionada${selCount !== 1 ? "s" : ""} de ${f.pdfImages[0].total} adjunta${selCount !== 1 ? "s" : ""} como imagen`
      : f.isImage ? "imagen adjunta"
      : "[formato no visual — sin contenido extraíble]";
    let escalaInfo = "";
    if (f.escalasMultiples && f.escalasPorPagina?.some(ep => ep.capturas?.some(c => c.escala))) {
      escalaInfo = " — Escalas: " + f.escalasPorPagina
        .flatMap(ep => ep.capturas.filter(c => c.escala).map(c => `pág.${ep.pagina}=${c.escala}`))
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
        .map(([id, z]) => {
          const lineas = [`Zona ${id} (${z.nombre}): ${z.descripcion || ""}`];
          if (z.coef_ocupacion_suelo)    lineas.push(`  COS=${z.coef_ocupacion_suelo}`);
          if (z.coef_constructibilidad)  lineas.push(`  Constructibilidad=${z.coef_constructibilidad}`);
          if (z.altura_maxima_m)         lineas.push(`  Altura máx=${z.altura_maxima_m}m`);
          if (z.densidad_bruta_maxima_hab_ha) lineas.push(`  Densidad máx=${z.densidad_bruta_maxima_hab_ha} Hab/Há`);
          if (z.articulo)                lineas.push(`  Referencia: ${z.articulo}`);
          if (z.notas)                   lineas.push(`  Notas: ${z.notas}`);
          return lineas.join("\n");
        }).join("\n")
    : "";

  const comunaNombre = prcData ? prcData.meta.nombre : (comuna || "la comuna");

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
- DDU 279: Accesibilidad universal — rampas, ascensores, circulaciones accesibles
- DDU 390: Presentación de expedientes DOM — documentos obligatorios por tipo de proyecto
- DDU 320: Adosamiento y distanciamientos entre edificaciones
- DDU 415: Estacionamientos — dotación mínima según uso y comuna

Usa la normativa anterior como base de tu análisis. Cita el artículo exacto de OGUC, LGUC o la circular DDU correspondiente cuando detectes cumplimiento o incumplimiento.
${contextoTexto}${modo === "completo"
  ? `MODO EXPEDIENTE COMPLETO: Verifica rigurosamente si el expediente contiene TODOS los documentos obligatorios para un proyecto ${TIPOS.find(t => t.id === tipo)?.label ?? tipo}. Lista en documentos_faltantes cada documento obligatorio ausente con su artículo de referencia y criticidad. Penaliza el puntaje_global si faltan documentos críticos.`
  : `MODO PARCIAL: Analiza solo los archivos adjuntos sin penalizar por documentos no subidos.`}

Para cada planta de arquitectura identifica los recintos visibles. En "recintos" incluye nombre, uso declarado, superficie estimada en m2, estado normativo y bbox como fraccion de la imagen (bbox:[x1,y1,x2,y2] donde 0,0 es esquina superior-izquierda y 1,1 inferior-derecha). Indica en que pagina aparece cada recinto. Si no puedes estimar coordenadas confiables para un recinto, omite su campo bbox.

Responde SOLO con JSON puro sin markdown:
{"resumen_general":"...","puntaje_global":0,"estado_global":"APROBABLE|OBSERVADO|RECHAZABLE","documentos_faltantes":[{"nombre":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA"}],"analisis_por_archivo":[{"archivo":"...","tipo_detectado":"...","estado":"OK|CON OBSERVACIONES|INCOMPLETO|NO LEGIBLE","observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}],"elementos_ok":["..."],"recintos":[{"nombre":"...","uso":"...","superficie_m2":0,"pagina":1,"bbox":[0.1,0.1,0.5,0.5],"estado":"OK|OBSERVADO|INCUMPLE","observacion":"..."}]}],"alertas_especiales":["..."],"pasos_siguientes":["..."]}`;
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
  const [modoAnalisis, setModoAnalisis] = useState("parcial");
  const [modalDwg, setModalDwg] = useState(false);
  const [dwgBloqueado, setDwgBloqueado] = useState(false);
  const [preguntas, setPreguntas] = useState({ situacion: "", analizarSituacion: "", niveles: "" });
  const inputRef = useRef();

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
        base64: f.type.startsWith("image/") ? await toBase64(f) : null,
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
  const addCaptura = (fileIdx, pagina) => setArchivos(prev => prev.map((f, idx) => {
    if (idx !== fileIdx) return f;
    return { ...f, escalasPorPagina: f.escalasPorPagina.map(ep =>
      ep.pagina === pagina ? { ...ep, capturas: [...ep.capturas, { escala: "", nombre: "", base64: "" }] } : ep
    )};
  }));
  const removeCaptura = (fileIdx, pagina, ci) => setArchivos(prev => prev.map((f, idx) => {
    if (idx !== fileIdx) return f;
    return { ...f, escalasPorPagina: f.escalasPorPagina.map(ep =>
      ep.pagina === pagina ? { ...ep, capturas: ep.capturas.filter((_, j) => j !== ci) } : ep
    )};
  }));
  const setCapturaEscala = (fileIdx, pagina, ci, value) => setArchivos(prev => prev.map((f, idx) => {
    if (idx !== fileIdx) return f;
    return { ...f, escalasPorPagina: f.escalasPorPagina.map(ep => {
      if (ep.pagina !== pagina) return ep;
      return { ...ep, capturas: ep.capturas.map((c, j) => j === ci ? { ...c, escala: value } : c) };
    })};
  }));
  async function handleScaleScreenshot(fileIdx, pagina, ci, file) {
    if (!file) return;
    const b64 = await toBase64(file);
    setArchivos(prev => prev.map((f, idx) => {
      if (idx !== fileIdx) return f;
      return { ...f, escalasPorPagina: f.escalasPorPagina.map(ep => {
        if (ep.pagina !== pagina) return ep;
        return { ...ep, capturas: ep.capturas.map((c, j) => j === ci ? { ...c, nombre: file.name, base64: b64 } : c) };
      })};
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

  // ── Análisis ───────────────────────────────────────────────────────────
  async function analizar() {
    if (!archivos.length || !comuna) return;
    setLoading(true); setError(""); setResult(null);
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
                content.push({ type: "text", text: `[REFERENCIA ESCALA: "${f.name}" — página ${ep.pagina} — escala declarada: ${c.escala || "no especificada"}]` });
              }
            }
          }
        }
      }
      content.push({ type: "text", text: buildPrompt(tipo, comuna, archivos, modoAnalisis, preguntas) });

      setProgress("Analizando contra normativa OGUC / LGUC...");

      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message);

      const raw   = data.content?.map(b => b.text || "").join("") || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      setResult(repairAndParse(clean));

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

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

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
                        <select value={f.tipoDoc} onChange={e => setTipoDoc(i, e.target.value)}
                          style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 6, padding: "4px 8px", color: "#3D4A5C", fontSize: 11, fontFamily: "inherit", cursor: "pointer", maxWidth: 190 }}>
                          <option value="">— tipo —</option>
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
                                style={{ background: "none", border: "1px solid #D1D9EE", borderRadius: 5, padding: "3px 8px", color: "#6B7A99", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                                Hay múltiples escalas
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                                <span style={{ fontSize: 10, color: "#D68910", letterSpacing: "1px" }}>ESCALAS POR PÁGINA</span>
                                <button onClick={() => toggleEscalasMultiples(i)}
                                  style={{ background: "none", border: "1px solid #D1D9EE", borderRadius: 5, padding: "2px 7px", color: "#6B7A99", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                                  Una sola escala
                                </button>
                              </div>
                              {f.escalasPorPagina.filter(ep => f.paginasSeleccionadas.includes(ep.pagina)).map(ep => (
                                <div key={ep.pagina} style={{ marginBottom: 10 }}>
                                  {/* Encabezado de página + botón agregar */}
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                                    <span style={{ fontSize: 11, color: "#6B7A99", minWidth: 50, flexShrink: 0 }}>Pág. {ep.pagina}</span>
                                    <button onClick={() => addCaptura(i, ep.pagina)}
                                      style={{ background: "rgba(74,114,196,0.06)", border: "1px solid #D1D9EE", borderRadius: 5, padding: "2px 9px", color: "#2952A3", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
                                      + captura
                                    </button>
                                  </div>
                                  {/* Lista de capturas */}
                                  {ep.capturas.map((c, ci) => (
                                    <div key={ci} style={{ paddingLeft: 58, marginBottom: 6 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <label style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: c.base64 ? "#1E8449" : "#2952A3", background: c.base64 ? "rgba(30,132,73,0.06)" : "rgba(74,114,196,0.06)", border: `1px solid ${c.base64 ? "rgba(30,132,73,0.3)" : "#D1D9EE"}`, borderRadius: 5, padding: "3px 8px" }}>
                                          {c.base64 ? `✓ ${c.nombre.length > 14 ? c.nombre.slice(0,14)+"…" : c.nombre}` : "Subir captura"}
                                          <input type="file" accept="image/*" style={{ display: "none" }}
                                            onChange={e => handleScaleScreenshot(i, ep.pagina, ci, e.target.files[0])} />
                                        </label>
                                        {c.base64 && (
                                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ fontSize: 10, color: c.escala ? "#3D4A5C" : "#D68910", whiteSpace: "nowrap" }}>escala:</span>
                                            <select value={c.escala} onChange={e => setCapturaEscala(i, ep.pagina, ci, e.target.value)}
                                              style={{ background: "#FFFFFF", border: `1px solid ${c.escala ? "#D1D9EE" : "#D68910"}`, borderRadius: 5, padding: "3px 7px", color: c.escala ? "#3D4A5C" : "#D68910", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                                              <option value="">— indicar —</option>
                                              {ESCALAS.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          </div>
                                        )}
                                        <button onClick={() => removeCaptura(i, ep.pagina, ci)}
                                          style={{ background: "none", border: "none", color: "#6B7A99", cursor: "pointer", fontSize: 12, padding: "0 2px", lineHeight: 1 }}>✕</button>
                                      </div>
                                      {c.base64 && !c.escala && (
                                        <div style={{ marginTop: 3, fontSize: 10, color: "#D68910" }}>
                                          Indica la escala de esta captura
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {ep.capturas.length === 0 && (
                                    <div style={{ paddingLeft: 58, fontSize: 10, color: "#B8C5E0" }}>
                                      Sin capturas — haz clic en "+ captura" para agregar
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modo de análisis */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#6B7A99", letterSpacing: "2px", marginBottom: 8 }}>MODO DE ANÁLISIS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { id: "parcial",  label: "Analizar lo subido",       desc: "Revisa solo los archivos adjuntos" },
                  { id: "completo", label: "Validar expediente completo", desc: "Exige todos los documentos obligatorios" },
                ].map(m => (
                  <button key={m.id} onClick={() => setModoAnalisis(m.id)}
                    style={{ background: modoAnalisis === m.id ? "#EEF2FB" : "#FFFFFF", border: `1px solid ${modoAnalisis === m.id ? "#2952A3" : "#D1D9EE"}`, borderRadius: 8, padding: "10px 12px", textAlign: "left", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: modoAnalisis === m.id ? "#1B3A8A" : "#6B7A99", fontFamily: "inherit", marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: modoAnalisis === m.id ? "#2952A3" : "#6B7A99", fontFamily: "inherit" }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Botón analizar */}
            <button onClick={analizar}
              disabled={loading || !archivos.length || !comuna}
              style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 600, letterSpacing: ".4px", cursor: loading || !archivos.length || !comuna ? "not-allowed" : "pointer", transition: "all .2s", background: loading || !archivos.length || !comuna ? "#B8C5E0" : "linear-gradient(90deg,#1B3A8A,#2952A3)", color: "#FFFFFF" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #B8C5E0", borderTop: "2px solid #1B3A8A", borderRadius: "50%", animation: "spin .7s linear infinite" }}/>
                  <span style={{ animation: "pulse 1.4s infinite" }}>{progress}</span>
                </span>
              ) : `Analizar ${archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? "s" : ""}` : "expediente"} →`}
            </button>

            {!comuna && archivos.length > 0 && (
              <p style={{ fontSize: 11, color: "#D68910", textAlign: "center", marginTop: 8 }}>
                ↑ Ingresa la comuna para habilitar el análisis
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
        {result && result.analisis_por_archivo?.some(a => a.estado === "NO LEGIBLE") && (
          <div style={{ marginTop: 16, background: "#FEF3CD", border: "1px solid #D68910", borderRadius: 10, padding: "16px 20px" }}>
            <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13, color: "#7D5A00", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              ⚠ Documento no legible detectado
            </p>
            <InstruccionesDwg />
          </div>
        )}
        {result && (
          <div className="fade-up" style={{ background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 14, boxShadow: "0 2px 12px rgba(27,58,138,0.07)", padding: "28px 28px" }}>

            {/* Encabezado */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9, color: "#6B7A99", letterSpacing: "3px", marginBottom: 8 }}>INFORME DE REVISIÓN NORMATIVA</div>
                <h2 style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "#1B3A8A" }}>
                  {TIPOS.find(t => t.id === tipo)?.label} · {comuna}
                </h2>
                <div style={{ fontSize: 11, color: "#6B7A99" }}>
                  {archivos.length} documentos · {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", padding: "5px 16px", borderRadius: 99, ...ec }}>
                  {result.estado_global}
                </span>
                <div>
                  <span style={{ fontSize: 42, fontWeight: 800, fontFamily: "'Inter', sans-serif", color: ec.color, lineHeight: 1 }}>{result.puntaje_global}</span>
                  <span style={{ fontSize: 13, color: "#6B7A99" }}>/100</span>
                </div>
              </div>
            </div>

            {/* Barra */}
            <div style={{ background: "#EEF2FB", borderRadius: 99, height: 5, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ width: `${result.puntaje_global}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${ec.color}80,${ec.color})`, transition: "width 1.2s ease" }}/>
            </div>
            <p style={{ fontSize: 13, color: "#6B7A99", lineHeight: 1.7, marginBottom: 24 }}>{result.resumen_general}</p>

            {/* Métricas */}
            {(() => {
              const totalObs = (result.analisis_por_archivo || []).reduce((s, a) => s + (a.observaciones?.length || 0), 0);
              const altas    = (result.analisis_por_archivo || []).reduce((s, a) => s + (a.observaciones?.filter(o => o.criticidad === "ALTA").length || 0), 0);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 26 }}>
                  {[
                    { n: archivos.length,                           label: "Archivos",       c: "#3b82f6" },
                    { n: totalObs,                                   label: "Observaciones",  c: "#f59e0b" },
                    { n: altas,                                      label: "Críticas",       c: "#ef4444" },
                    { n: result.documentos_faltantes?.length || 0,  label: "Docs faltantes", c: "#2952A3" },
                  ].map(m => (
                    <div key={m.label} style={{ background: "#F4F6FB", border: "1px solid #D1D9EE", borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Inter', sans-serif", color: m.c, lineHeight: 1 }}>{m.n}</div>
                      <div style={{ fontSize: 10, color: "#6B7A99", marginTop: 3 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Documentos faltantes */}
            {result.documentos_faltantes?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, color: "#2952A3", letterSpacing: "2px", marginBottom: 10 }}>
                  DOCUMENTOS FALTANTES — {result.documentos_faltantes.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.documentos_faltantes.map((d, i) => (
                    <div key={i} style={{ background: "#EEF2FB", border: "1px solid #D1D9EE", borderRadius: 8, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#1B3A8A", marginBottom: 2 }}>{d.nombre}</div>
                        <div style={{ fontSize: 11, color: "#2952A3" }}>📘 {d.articulo}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 4, flexShrink: 0, ...critStyle(d.criticidad) }}>{d.criticidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Análisis por archivo */}
            <div style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 10, color: "#1B3A8A", letterSpacing: "2px", marginBottom: 12 }}>
                ANÁLISIS POR DOCUMENTO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.analisis_por_archivo?.map((doc, i) => {
                  const est  = estadoDocStyle(doc.estado);
                  const open = expandido[`d${i}`] !== false;
                  return (
                    <div key={i} className="doc-card" style={{ background: "#F4F6FB", border: "1px solid #D1D9EE", borderRadius: 12, overflow: "hidden" }}>
                      <button onClick={() => toggle(`d${i}`)}
                        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>
                          {doc.archivo?.match(/\.(jpg|jpeg|png)/i) ? "🖼" : doc.archivo?.match(/\.(dwg|dxf)/i) ? "📐" : "📄"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#1B3A8A", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.archivo}</div>
                          <div style={{ fontSize: 11, color: "#6B7A99", marginTop: 1 }}>{doc.tipo_detectado}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, flexShrink: 0, ...est }}>{doc.estado}</span>
                        {doc.observaciones?.length > 0 && (
                          <span style={{ fontSize: 10, color: "#D68910", background: "rgba(214,137,16,0.08)", border: "1px solid rgba(214,137,16,0.25)", borderRadius: 99, padding: "2px 8px", flexShrink: 0 }}>
                            {doc.observaciones.length}
                          </span>
                        )}
                        <span style={{ color: "#6B7A99", fontSize: 11, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
                      </button>

                      {open && (
                        <div style={{ borderTop: "1px solid #D1D9EE", padding: "14px 16px" }}>
                          {/* OK */}
                          {doc.elementos_ok?.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 9, color: "#1E8449", letterSpacing: "2px", marginBottom: 8 }}>CUMPLE ✓</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {doc.elementos_ok.map((ok, j) => (
                                  <span key={j} style={{ fontSize: 11, color: "#1E8449", background: "rgba(30,132,73,0.08)", border: "1px solid rgba(30,132,73,0.25)", borderRadius: 6, padding: "3px 10px" }}>{ok}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Observaciones */}
                          {doc.observaciones?.length > 0 ? (
                            <div>
                              <div style={{ fontSize: 9, color: "#C0392B", letterSpacing: "2px", marginBottom: 8 }}>OBSERVACIONES — {doc.observaciones.length}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {doc.observaciones.map((obs, j) => {
                                  const cs = critStyle(obs.criticidad);
                                  return (
                                    <div key={j} className="obs-card" style={{ ...cs, borderRadius: 8, padding: "12px 14px", transition: "border-color .15s" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                                        <div style={{ fontSize: 13, color: "#3D4A5C", lineHeight: 1.5, flex: 1 }}>{obs.descripcion}</div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: cs.color, background: cs.background, border: cs.border, borderRadius: 4, padding: "2px 8px", flexShrink: 0, alignSelf: "flex-start" }}>{obs.criticidad}</span>
                                      </div>
                                      <div style={{ fontSize: 11, color: "#2952A3", marginBottom: obs.correccion ? 6 : 0 }}>📘 {obs.articulo}</div>
                                      {obs.correccion && (
                                        <div style={{ fontSize: 12, color: "#6B7A99", borderTop: "1px solid #D1D9EE", paddingTop: 8, marginTop: 4, lineHeight: 1.5 }}>
                                          <span style={{ color: "#2952A3" }}>→ </span>{obs.correccion}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "#1E8449", textAlign: "center", padding: "10px 0" }}>✓ Sin observaciones</div>
                          )}

                          {/* Overlay de recintos */}
                          {(() => {
                            const recintos = doc.recintos?.filter(r => Array.isArray(r.bbox));
                            if (!recintos?.length) return null;
                            const archivoMatch = archivos.find(a => a.name === doc.archivo);
                            const paginas = [...new Set(recintos.map(r => r.pagina))].sort((a, b) => a - b);
                            return (
                              <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 9, color: "#2952A3", letterSpacing: "2px", marginBottom: 10 }}>
                                  RECINTOS DETECTADOS — {recintos.length}
                                  <span style={{ fontSize: 9, color: "#6B7A99", letterSpacing: 0, marginLeft: 8, fontWeight: 400 }}>(estimación IA — posiciones aproximadas)</span>
                                </div>
                                {/* Leyenda */}
                                <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                                  {[["OK","#1E8449"],["OBSERVADO","#D68910"],["INCUMPLE","#C0392B"]].map(([label, color]) => (
                                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6B7A99" }}>
                                      <div style={{ width: 12, height: 12, borderRadius: 2, background: color+"28", border: `2px solid ${color}` }}/>
                                      {label}
                                    </div>
                                  ))}
                                </div>
                                {paginas.map(pag => {
                                  let src = null;
                                  if (archivoMatch?.pdfImages) {
                                    const imgData = archivoMatch.pdfImages.find(p => p.page === pag);
                                    src = imgData?.thumb || null;
                                  } else if (archivoMatch?.isImage && archivoMatch.base64) {
                                    src = `data:${archivoMatch.type};base64,${archivoMatch.base64}`;
                                  }
                                  if (!src) return null;
                                  return (
                                    <div key={pag} style={{ marginBottom: 12 }}>
                                      {paginas.length > 1 && (
                                        <div style={{ fontSize: 10, color: "#6B7A99", marginBottom: 5 }}>Página {pag}</div>
                                      )}
                                      <CanvasOverlay src={src} recintos={recintos} pagina={pag} />
                                    </div>
                                  );
                                })}
                                {/* Tabla de recintos */}
                                <div style={{ marginTop: 10, overflowX: "auto" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                    <thead>
                                      <tr style={{ background: "#EEF2FB" }}>
                                        {["Recinto","Uso","Sup. m²","Pág.","Estado","Observación"].map(h => (
                                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#1B3A8A", fontWeight: 600, borderBottom: "1px solid #D1D9EE", whiteSpace: "nowrap" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {doc.recintos.map((r, ri) => {
                                        const cs = { OK: "#1E8449", OBSERVADO: "#D68910", INCUMPLE: "#C0392B" }[r.estado] || "#6B7A99";
                                        return (
                                          <tr key={ri} style={{ borderBottom: "1px solid #EEF2FB" }}>
                                            <td style={{ padding: "6px 10px", color: "#1B3A8A", fontWeight: 500 }}>{r.nombre}</td>
                                            <td style={{ padding: "6px 10px", color: "#6B7A99" }}>{r.uso || "—"}</td>
                                            <td style={{ padding: "6px 10px", color: "#3D4A5C" }}>{r.superficie_m2 ?? "—"}</td>
                                            <td style={{ padding: "6px 10px", color: "#6B7A99" }}>{r.pagina}</td>
                                            <td style={{ padding: "6px 10px" }}>
                                              <span style={{ color: cs, fontWeight: 700, fontSize: 10 }}>{r.estado}</span>
                                            </td>
                                            <td style={{ padding: "6px 10px", color: "#6B7A99", maxWidth: 200 }}>{r.observacion || "—"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Alertas especiales */}
            {result.alertas_especiales?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, color: "#2952A3", letterSpacing: "2px", marginBottom: 8 }}>ALERTAS ESPECIALES</div>
                {result.alertas_especiales.map((a, i) => (
                  <div key={i} style={{ background: "#FEF3CD", border: "1px solid #D68910", borderRadius: 8, padding: "11px 14px", marginBottom: 6, fontSize: 13, color: "#7D5A00", lineHeight: 1.6 }}>
                    ⚠ {a}
                  </div>
                ))}
              </div>
            )}

            {/* Pasos siguientes */}
            {result.pasos_siguientes?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, color: "#1B3A8A", letterSpacing: "2px", marginBottom: 8 }}>PASOS SIGUIENTES</div>
                {result.pasos_siguientes.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #D1D9EE" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#1B3A8A,#2952A3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: "#3D4A5C", lineHeight: 1.6 }}>{p}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ background: "#EEF2FB", border: "1px solid #D1D9EE", borderRadius: 8, padding: "12px 16px", fontSize: 11, color: "#6B7A99", lineHeight: 1.7, marginBottom: 18 }}>
              ⚠ Análisis orientativo. No reemplaza la revisión oficial de la DOM. Consulte siempre el Plan Regulador Comunal y la DOM de su comuna.
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setResult(null); setArchivos([]); }}
                style={{ flex: 1, padding: "13px", background: "#FFFFFF", border: "1px solid #D1D9EE", borderRadius: 10, color: "#2952A3", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                ↩ Nuevo análisis
              </button>
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: "13px", background: "linear-gradient(90deg,#1B3A8A,#2952A3)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                🖨 Exportar informe
              </button>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
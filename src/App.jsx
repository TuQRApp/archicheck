import { useState, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import SelectorComuna from './components/SelectorComuna.jsx';
import ogucArticulos from "../normativa/nacional/oguc_articulos.json";
import lgucArticulos from "../normativa/nacional/lguc_articulos.json";
import ley19300Articulos from "../normativa/nacional/ley19300_articulos.json";
import reglasNacionales from "../normativa/nacional/reglas_verificacion.json";
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

// ── IMPORTANTE: reemplaza esta URL con la de tu Worker desplegado ──────────
const WORKER_URL = "https://archicheck-worker.nestragues.workers.dev";

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
function buildPrompt(tipo, comuna, archivos, modo = "parcial") {
  const tipoLabel = TIPOS.find(t => t.id === tipo)?.label || tipo;
  const lista = archivos.map((f, i) => {
    const tag = f.pdfImages?.length
      ? `${f.pdfImages.length} pág. adjunta${f.pdfImages.length > 1 ? "s" : ""} como imagen (de ${f.pdfImages[0].total} total)`
      : f.isImage ? "imagen adjunta"
      : "[formato no visual — sin contenido extraíble]";
    return `Archivo ${i + 1}: "${f.name}" (${f.tipoDoc || "sin clasificar"}) — ${tag}`;
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

  return `Eres revisor DOM de Chile experto en LGUC, OGUC, normativas NCh y Plan Regulador de ${comuna || "la comuna"}.

NORMATIVA NACIONAL VIGENTE — OGUC (última versión ${ogucArticulos.ultima_version}):
${ogucTexto}

NORMATIVA NACIONAL VIGENTE — LGUC (última versión ${lgucArticulos.ultima_version}):
${lgucTexto}

REGLAS DE VERIFICACIÓN OBLIGATORIAS:
${reglasTexto}

Proyecto: ${tipoLabel} — ${comuna || "comuna no especificada"}
Archivos:
${lista}

Usa la normativa anterior como base de tu análisis. Cita el artículo exacto
cuando detectes cumplimiento o incumplimiento.
${modo === "completo"
  ? `MODO EXPEDIENTE COMPLETO: Verifica rigurosamente si el expediente contiene TODOS los documentos obligatorios para un proyecto ${TIPOS.find(t => t.id === tipo)?.label ?? tipo}. Lista en documentos_faltantes cada documento obligatorio ausente con su artículo de referencia y criticidad. Penaliza el puntaje_global si faltan documentos críticos.`
  : `MODO PARCIAL: Analiza solo los archivos adjuntos sin penalizar por documentos no subidos.`}

Responde SOLO con JSON puro sin markdown:
{"resumen_general":"...","puntaje_global":0,"estado_global":"APROBABLE|OBSERVADO|RECHAZABLE","documentos_faltantes":[{"nombre":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA"}],"analisis_por_archivo":[{"archivo":"...","tipo_detectado":"...","estado":"OK|CON OBSERVACIONES|INCOMPLETO|NO LEGIBLE","observaciones":[{"descripcion":"...","articulo":"...","criticidad":"ALTA|MEDIA|BAJA","correccion":"..."}],"elementos_ok":["..."]}],"alertas_especiales":["..."],"pasos_siguientes":["..."]}`;
}

// ── PDF → imágenes base64 (máx. 1 página) ─────────────────────────────────
const MAX_PDF_PAGES = 1;

async function pdfPagesToBase64(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const images = [];
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push({ data: canvas.toDataURL("image/jpeg", 0.4).split(",")[1], page: i, total: pdf.numPages });
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
  ALTA:  { color: "#fca5a5", background: "rgba(239,68,68,0.12)",  border: "1px solid rgba(239,68,68,0.3)" },
  MEDIA: { color: "#fcd34d", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)" },
  BAJA:  { color: "#86efac", background: "rgba(34,197,94,0.12)",  border: "1px solid rgba(34,197,94,0.3)" },
})[c] || {};

const estadoDocStyle = (e) => ({
  "OK":                { color: "#4ade80", background: "rgba(74,222,128,0.1)",  border: "1px solid rgba(74,222,128,0.25)" },
  "CON OBSERVACIONES": { color: "#fbbf24", background: "rgba(251,191,36,0.1)",  border: "1px solid rgba(251,191,36,0.25)" },
  "INCOMPLETO":        { color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)" },
  "NO LEGIBLE":        { color: "#94a3b8", background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.25)" },
})[e] || {};

const globalStyle = (e) => ({
  "APROBABLE":  { color: "#4ade80", background: "rgba(74,222,128,0.12)",  border: "1px solid rgba(74,222,128,0.35)" },
  "OBSERVADO":  { color: "#fbbf24", background: "rgba(251,191,36,0.12)",  border: "1px solid rgba(251,191,36,0.35)" },
  "RECHAZABLE": { color: "#f87171", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)" },
})[e] || {};

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
    const procesados = await Promise.all(validos.map(async (f) => ({
      file: f,
      name: f.name,
      size: f.size,
      type: f.type,
      isImage: f.type.startsWith("image/"),
      pdfImages: f.type === "application/pdf" ? await pdfPagesToBase64(f) : null,
      base64: f.type.startsWith("image/") ? await toBase64(f) : null,
      tipoDoc: "",
    })));
    setArchivos(prev => [...prev, ...procesados]);
  }, []);

  const removeFile   = (i) => setArchivos(prev => prev.filter((_, idx) => idx !== i));
  const setTipoDoc   = (i, v) => setArchivos(prev => prev.map((f, idx) => idx === i ? { ...f, tipoDoc: v } : f));
  const toggle       = (k) => setExpandido(prev => ({ ...prev, [k]: !prev[k] }));

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
          content.push({ type: "text", text: `[Imagen: "${f.name}" — ${f.tipoDoc || "plano"}]` });
        }
        if (f.pdfImages?.length) {
          for (const img of f.pdfImages) {
            content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
            content.push({ type: "text", text: `[PDF: "${f.name}" — página ${img.page}/${img.total} — ${f.tipoDoc || "plano"}]` });
          }
        }
      }
      content.push({ type: "text", text: buildPrompt(tipo, comuna, archivos, modoAnalisis) });

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
      background: "#0F172A",
      border: "1px solid #1E3A8A",
      borderRadius: 10,
      padding: "20px 24px",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>📐</span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 800, fontSize: 13, color: "#60A5FA", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
            <span style={{ background: "#1E3A8A", color: "white", borderRadius: "50%", width: 22, height: 22, minWidth: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{n}</span>
            <span style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.5 }}>{texto}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "10px 14px", background: "#1E3A8A22", border: "1px solid #1E3A8A", borderRadius: 7, fontSize: 12, color: "#93C5FD" }}>
        ⚠ ArchiCheck no acepta archivos DWG ni DXF directamente.
        Convierte a PDF siguiendo los pasos anteriores y vuelve a subir.
      </div>
    </div>
  );

  const ModalDwg = () => modalDwg ? (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#06090f", border: "1px solid #1E3A8A", borderRadius: 14, padding: 28, maxWidth: 620, width: "100%", boxShadow: "0 25px 50px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#F87171", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            ✗ Formato no compatible
          </span>
          <button onClick={() => setModalDwg(false)} style={{ background: "none", border: "none", color: "#64748B", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        <InstruccionesDwg />
        <button onClick={() => setModalDwg(false)} style={{ marginTop: 16, width: "100%", background: "linear-gradient(90deg,#1e3a8a,#2563eb)", color: "white", border: "none", borderRadius: 8, padding: "11px 0", fontWeight: 700, fontSize: 13, cursor: "pointer", letterSpacing: "0.04em" }}>
          Entendido — voy a convertir el archivo a PDF
        </button>
      </div>
    </div>
  ) : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#06090f", color: "#e2e8f0", fontFamily: "'DM Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .35s ease forwards}
        .file-row:hover{background:rgba(30,58,95,.3)!important}
        .rm:hover{color:#f87171!important}
        .doc-card{transition:all .2s}
        .doc-card:hover{transform:translateY(-1px);box-shadow:0 8px 32px rgba(0,0,0,.5)}
        .obs-card:hover{border-color:rgba(99,152,210,.45)!important}
        input,select,textarea{outline:none}
        select option{background:#0a1628}
      `}</style>

      {/* Banda superior */}
      <div style={{ height: 3, background: "linear-gradient(90deg,#1e3a8a,#3b82f6,#06b6d4,#3b82f6,#1e3a8a)" }} />

      {/* Header */}
      <header style={{ padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #0d1f35" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="36" height="36" viewBox="0 0 36 36">
            <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#0891b2"/></linearGradient></defs>
            <rect width="36" height="36" rx="9" fill="url(#lg)"/>
            <path d="M18 7L29 13V23L18 29L7 23V13Z" fill="none" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M18 7V29M7 13L29 13M7 23L29 23" stroke="white" strokeWidth="0.6" opacity="0.45"/>
            <circle cx="18" cy="18" r="2.5" fill="white" opacity="0.9"/>
          </svg>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: "#f8fafc", letterSpacing: "-0.4px" }}>ArchiCheck</div>
            <div style={{ fontSize: 9, color: "#1e4d7a", letterSpacing: "3px" }}>REVISIÓN NORMATIVA · CHILE</div>
          </div>
        </div>
        <div style={{ textAlign: "right", lineHeight: 1.8 }}>
          <div style={{ fontSize: 10, color: "#1e3a5f" }}>OGUC · LGUC · NCh · SEIA</div>
          <a href="/ArchiCheck_Guia_Normativa.pdf" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: "#3b82f6", textDecoration: "none", letterSpacing: "0.03em" }}>
            ¿Cómo funciona ArchiCheck?
          </a>
        </div>
      </header>

      <ModalDwg />

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>

        {/* ── FORMULARIO ─────────────────────────────────────────────── */}
        {!result && (
          <div className="fade-up">
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: 30, fontWeight: 800, color: "#f8fafc", margin: "0 0 8px", lineHeight: 1.15 }}>
                Sube el expediente.<br/>
                <span style={{ color: "#3b82f6" }}>La IA hace la revisión.</span>
              </h1>
              <p style={{ color: "#334155", fontSize: 13, margin: 0, lineHeight: 1.7 }}>
                PDFs de planos, memorias, especificaciones, formularios MINVU.<br/>
                Recibirás observaciones detalladas por documento antes de presentar a la DOM.
              </p>
            </div>

            {/* Tipo + Comuna */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#334155", letterSpacing: "2px" }}>TIPO DE PROYECTO</span>
                <select value={tipo} onChange={e => setTipo(e.target.value)}
                  style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 12px", color: "#94a3b8", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
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
              <button onClick={() => setModalDwg(true)} style={{ background: "none", border: "1px solid #1E3A8A", borderRadius: 7, padding: "7px 14px", color: "#60A5FA", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                📐 Cómo subir archivos DWG
              </button>
            </div>

            {/* Drop zone */}
            <div
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => inputRef.current.click()}
              style={{ border: `2px dashed ${dragOver ? "#3b82f6" : "#1e3a5f"}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", cursor: "pointer", transition: "all .2s", background: dragOver ? "rgba(59,130,246,.06)" : "rgba(10,22,40,.6)", marginBottom: 14 }}>
              <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
                style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>⬆</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                Arrastra archivos o <span style={{ color: "#3b82f6" }}>haz clic para seleccionar</span>
              </div>
              <div style={{ fontSize: 11, color: "#1e3a5f" }}>PDF · JPG · PNG · DWG · DXF</div>
            </div>

            {/* Lista archivos */}
            {archivos.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 10, color: "#334155", letterSpacing: "2px", marginBottom: 8 }}>
                  ARCHIVOS — {archivos.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {archivos.map((f, i) => (
                    <div key={i} className="file-row" style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(10,22,40,.8)", border: "1px solid #0d1f35", borderRadius: 8, padding: "8px 12px", transition: "all .15s" }}>
                      <span style={{ fontSize: 15, flexShrink: 0 }}>
                        {f.isImage ? "🖼" : f.name.match(/\.(dwg|dxf)$/i) ? "📐" : "📄"}
                      </span>
                      <span style={{ fontSize: 12, color: "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <span style={{ fontSize: 10, color: "#1e3a5f", flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <select value={f.tipoDoc} onChange={e => setTipoDoc(i, e.target.value)}
                        style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 6, padding: "4px 8px", color: "#64748b", fontSize: 11, fontFamily: "inherit", cursor: "pointer", maxWidth: 190 }}>
                        <option value="">— tipo —</option>
                        {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button className="rm" onClick={() => removeFile(i)}
                        style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 14, padding: "0 4px", transition: "color .15s" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modo de análisis */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#334155", letterSpacing: "2px", marginBottom: 8 }}>MODO DE ANÁLISIS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { id: "parcial",  label: "Analizar lo subido",       desc: "Revisa solo los archivos adjuntos" },
                  { id: "completo", label: "Validar expediente completo", desc: "Exige todos los documentos obligatorios" },
                ].map(m => (
                  <button key={m.id} onClick={() => setModoAnalisis(m.id)}
                    style={{ background: modoAnalisis === m.id ? "rgba(59,130,246,0.12)" : "rgba(10,22,40,0.6)", border: `1px solid ${modoAnalisis === m.id ? "rgba(59,130,246,0.5)" : "#1e3a5f"}`, borderRadius: 8, padding: "10px 12px", textAlign: "left", cursor: "pointer", transition: "all .15s" }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: modoAnalisis === m.id ? "#93c5fd" : "#64748b", fontFamily: "inherit", marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: 10, color: modoAnalisis === m.id ? "#1e4d7a" : "#1e3a5f", fontFamily: "inherit" }}>{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Botón analizar */}
            <button onClick={analizar}
              disabled={loading || !archivos.length || !comuna}
              style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", fontFamily: "inherit", fontSize: 14, fontWeight: 500, letterSpacing: ".4px", cursor: loading || !archivos.length || !comuna ? "not-allowed" : "pointer", transition: "all .2s", background: loading || !archivos.length || !comuna ? "#0a1628" : "linear-gradient(135deg,#1d4ed8,#0891b2)", color: loading || !archivos.length || !comuna ? "#1e3a5f" : "#fff" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #1e4d7a", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin .7s linear infinite" }}/>
                  <span style={{ animation: "pulse 1.4s infinite" }}>{progress}</span>
                </span>
              ) : `Analizar ${archivos.length ? `${archivos.length} archivo${archivos.length > 1 ? "s" : ""}` : "expediente"} →`}
            </button>

            {!comuna && archivos.length > 0 && (
              <p style={{ fontSize: 11, color: "#92400e", textAlign: "center", marginTop: 8 }}>
                ↑ Ingresa la comuna para habilitar el análisis
              </p>
            )}

            {error && (
              <div style={{ marginTop: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#fca5a5" }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── RESULTADO ──────────────────────────────────────────────── */}
        {result && result.analisis_por_archivo?.some(a => a.estado === "NO LEGIBLE") && (
          <div style={{ marginTop: 16, background: "#1C1917", border: "1px solid #D97706", borderRadius: 10, padding: "16px 20px" }}>
            <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 13, color: "#FBBF24", fontFamily: "'DM Mono', monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              ⚠ Documento no legible detectado
            </p>
            <InstruccionesDwg />
          </div>
        )}
        {result && (
          <div className="fade-up">

            {/* Encabezado */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9, color: "#1e4d7a", letterSpacing: "3px", marginBottom: 8 }}>INFORME DE REVISIÓN NORMATIVA</div>
                <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "#f8fafc" }}>
                  {TIPOS.find(t => t.id === tipo)?.label} · {comuna}
                </h2>
                <div style={{ fontSize: 11, color: "#334155" }}>
                  {archivos.length} documentos · {new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", padding: "5px 16px", borderRadius: 99, ...ec }}>
                  {result.estado_global}
                </span>
                <div>
                  <span style={{ fontSize: 42, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: ec.color, lineHeight: 1 }}>{result.puntaje_global}</span>
                  <span style={{ fontSize: 13, color: "#334155" }}>/100</span>
                </div>
              </div>
            </div>

            {/* Barra */}
            <div style={{ background: "#0a1628", borderRadius: 99, height: 5, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ width: `${result.puntaje_global}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${ec.color}80,${ec.color})`, transition: "width 1.2s ease" }}/>
            </div>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.7, marginBottom: 24 }}>{result.resumen_general}</p>

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
                    { n: result.documentos_faltantes?.length || 0,  label: "Docs faltantes", c: "#a855f7" },
                  ].map(m => (
                    <div key={m.label} style={{ background: "#080e1a", border: "1px solid #0d1f35", borderRadius: 10, padding: "14px 10px", textAlign: "center" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: m.c, lineHeight: 1 }}>{m.n}</div>
                      <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Documentos faltantes */}
            {result.documentos_faltantes?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, color: "#6b21a8", letterSpacing: "2px", marginBottom: 10 }}>
                  DOCUMENTOS FALTANTES — {result.documentos_faltantes.length}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {result.documentos_faltantes.map((d, i) => (
                    <div key={i} style={{ background: "rgba(168,85,247,.06)", border: "1px solid rgba(168,85,247,.2)", borderRadius: 8, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 2 }}>{d.nombre}</div>
                        <div style={{ fontSize: 11, color: "#6b21a8" }}>📘 {d.articulo}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 4, flexShrink: 0, ...critStyle(d.criticidad) }}>{d.criticidad}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Análisis por archivo */}
            <div style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 10, color: "#1e4d7a", letterSpacing: "2px", marginBottom: 12 }}>
                ANÁLISIS POR DOCUMENTO
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {result.analisis_por_archivo?.map((doc, i) => {
                  const est  = estadoDocStyle(doc.estado);
                  const open = expandido[`d${i}`] !== false;
                  return (
                    <div key={i} className="doc-card" style={{ background: "#080e1a", border: "1px solid #0d1f35", borderRadius: 12, overflow: "hidden" }}>
                      <button onClick={() => toggle(`d${i}`)}
                        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
                        <span style={{ fontSize: 16, flexShrink: 0 }}>
                          {doc.archivo?.match(/\.(jpg|jpeg|png)/i) ? "🖼" : doc.archivo?.match(/\.(dwg|dxf)/i) ? "📐" : "📄"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.archivo}</div>
                          <div style={{ fontSize: 11, color: "#334155", marginTop: 1 }}>{doc.tipo_detectado}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, flexShrink: 0, ...est }}>{doc.estado}</span>
                        {doc.observaciones?.length > 0 && (
                          <span style={{ fontSize: 10, color: "#f59e0b", background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 99, padding: "2px 8px", flexShrink: 0 }}>
                            {doc.observaciones.length}
                          </span>
                        )}
                        <span style={{ color: "#334155", fontSize: 11, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
                      </button>

                      {open && (
                        <div style={{ borderTop: "1px solid #0d1f35", padding: "14px 16px" }}>
                          {/* OK */}
                          {doc.elementos_ok?.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 9, color: "#166534", letterSpacing: "2px", marginBottom: 8 }}>CUMPLE ✓</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {doc.elementos_ok.map((ok, j) => (
                                  <span key={j} style={{ fontSize: 11, color: "#4ade80", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6, padding: "3px 10px" }}>{ok}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Observaciones */}
                          {doc.observaciones?.length > 0 ? (
                            <div>
                              <div style={{ fontSize: 9, color: "#92400e", letterSpacing: "2px", marginBottom: 8 }}>OBSERVACIONES — {doc.observaciones.length}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {doc.observaciones.map((obs, j) => {
                                  const cs = critStyle(obs.criticidad);
                                  return (
                                    <div key={j} className="obs-card" style={{ ...cs, borderRadius: 8, padding: "12px 14px", transition: "border-color .15s" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                                        <div style={{ fontSize: 13, color: "#f1f5f9", lineHeight: 1.5, flex: 1 }}>{obs.descripcion}</div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: cs.color, background: "rgba(0,0,0,.3)", border: `1px solid ${cs.color}50`, borderRadius: 4, padding: "2px 8px", flexShrink: 0, alignSelf: "flex-start" }}>{obs.criticidad}</span>
                                      </div>
                                      <div style={{ fontSize: 11, color: "#1e4d7a", marginBottom: obs.correccion ? 6 : 0 }}>📘 {obs.articulo}</div>
                                      {obs.correccion && (
                                        <div style={{ fontSize: 12, color: "#94a3b8", borderTop: "1px solid rgba(255,255,255,.05)", paddingTop: 8, marginTop: 4, lineHeight: 1.5 }}>
                                          <span style={{ color: "#3b82f6" }}>→ </span>{obs.correccion}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: "#166534", textAlign: "center", padding: "10px 0" }}>✓ Sin observaciones</div>
                          )}
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
                <div style={{ fontSize: 10, color: "#6b21a8", letterSpacing: "2px", marginBottom: 8 }}>ALERTAS ESPECIALES</div>
                {result.alertas_especiales.map((a, i) => (
                  <div key={i} style={{ background: "rgba(168,85,247,.07)", border: "1px solid rgba(168,85,247,.2)", borderRadius: 8, padding: "11px 14px", marginBottom: 6, fontSize: 13, color: "#d8b4fe", lineHeight: 1.6 }}>
                    ⚠ {a}
                  </div>
                ))}
              </div>
            )}

            {/* Pasos siguientes */}
            {result.pasos_siguientes?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, color: "#1e4d7a", letterSpacing: "2px", marginBottom: 8 }}>PASOS SIGUIENTES</div>
                {result.pasos_siguientes.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #0d1f35" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#1d4ed8,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{i + 1}</div>
                    <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6 }}>{p}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ background: "#080e1a", border: "1px solid #0d1f35", borderRadius: 8, padding: "12px 16px", fontSize: 11, color: "#1e3a5f", lineHeight: 1.7, marginBottom: 18 }}>
              ⚠ Análisis orientativo. No reemplaza la revisión oficial de la DOM. Consulte siempre el Plan Regulador Comunal y la DOM de su comuna.
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setResult(null); setArchivos([]); }}
                style={{ flex: 1, padding: "13px", background: "#080e1a", border: "1px solid #0d1f35", borderRadius: 10, color: "#334155", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                ↩ Nuevo análisis
              </button>
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: "13px", background: "linear-gradient(135deg,#1d4ed8,#0891b2)", border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                🖨 Exportar informe
              </button>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
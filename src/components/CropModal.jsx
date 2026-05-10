import { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

const ESCALAS = ["1:25","1:50","1:75","1:100","1:150","1:200","1:250","1:500","1:1000","1:2000"];

export default function CropModal({ file, onSave, onClose }) {
  const [totalPages, setTotalPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [rendering, setRendering]     = useState(true);

  const [sel, setSel]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef(null);

  const [confirmStep, setConfirmStep] = useState(false);
  const [cropPreview, setCropPreview] = useState(null);
  const [cropName, setCropName]       = useState("");
  const [cropEscala, setCropEscala]   = useState("");
  const [saving, setSaving]           = useState(false);

  const [savedCrops, setSavedCrops] = useState([]);

  const canvasRef  = useRef(null);
  const pdfDocRef  = useRef(null);
  const pageDimRef = useRef({ w: 1, h: 1 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ab  = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        await renderPage(pdf, 1);
      } catch (e) {
        console.error(e);
        setRendering(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function renderPage(pdf, n) {
    setRendering(true);
    setSel(null);
    setConfirmStep(false);
    try {
      const page = await pdf.getPage(n);
      const vp   = page.getViewport({ scale: 1.5 });
      const cv   = canvasRef.current;
      if (!cv) return;
      cv.width  = vp.width;
      cv.height = vp.height;
      pageDimRef.current = { w: vp.width, h: vp.height };
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    } catch (e) {
      console.error(e);
    }
    setRendering(false);
  }

  function getXY(e) {
    const cv   = canvasRef.current;
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left)  * (cv.width  / rect.width),
      y: (e.clientY - rect.top)   * (cv.height / rect.height),
    };
  }

  function onMouseDown(e) {
    if (confirmStep || rendering) return;
    e.preventDefault();
    const pt = getXY(e);
    dragStartRef.current = pt;
    setDragging(true);
    setSel({ x: pt.x, y: pt.y, w: 0, h: 0 });
  }

  function onMouseMove(e) {
    if (!dragging || !dragStartRef.current) return;
    const pt = getXY(e);
    const ds = dragStartRef.current;
    setSel({ x: ds.x, y: ds.y, w: pt.x - ds.x, h: pt.y - ds.y });
  }

  function onMouseUp() {
    if (dragging) setDragging(false);
  }

  function norm(s) {
    if (!s) return null;
    return { x: s.w >= 0 ? s.x : s.x + s.w, y: s.h >= 0 ? s.y : s.y + s.h, w: Math.abs(s.w), h: Math.abs(s.h) };
  }

  async function handleConfirm() {
    const ns = norm(sel);
    if (!ns || ns.w < 20 || ns.h < 20) return;
    const cv = canvasRef.current;
    const pc = document.createElement("canvas");
    pc.width  = Math.round(ns.w);
    pc.height = Math.round(ns.h);
    pc.getContext("2d").drawImage(cv, Math.round(ns.x), Math.round(ns.y), Math.round(ns.w), Math.round(ns.h), 0, 0, Math.round(ns.w), Math.round(ns.h));
    setCropPreview(pc.toDataURL("image/jpeg", 0.85));
    setConfirmStep(true);
  }

  async function handleSave() {
    if (!cropName.trim() || !cropEscala) return;
    setSaving(true);
    try {
      const ns  = norm(sel);
      const pdf = pdfDocRef.current;
      const { w: w0, h: h0 } = pageDimRef.current;

      const page = await pdf.getPage(currentPage);
      const vpHi = page.getViewport({ scale: 3.5 });
      const hi   = document.createElement("canvas");
      hi.width   = vpHi.width;
      hi.height  = vpHi.height;
      await page.render({ canvasContext: hi.getContext("2d"), viewport: vpHi }).promise;

      const factor = 3.5 / 1.5;
      const cx = Math.round(ns.x * factor), cy = Math.round(ns.y * factor);
      const cw = Math.round(ns.w * factor), ch = Math.round(ns.h * factor);
      const crop = document.createElement("canvas");
      crop.width  = cw;
      crop.height = ch;
      crop.getContext("2d").drawImage(hi, cx, cy, cw, ch, 0, 0, cw, ch);

      const saved = {
        base64:  crop.toDataURL("image/jpeg", 0.88).split(",")[1],
        nombre:  cropName.trim(),
        escala:  cropEscala,
        pagina:  currentPage,
        x_pct:   (ns.x / w0) * 100,
        y_pct:   (ns.y / h0) * 100,
        w_pct:   (ns.w / w0) * 100,
        h_pct:   (ns.h / h0) * 100,
      };
      onSave(saved);
      setSavedCrops(prev => [...prev, saved]);
      setSel(null); setConfirmStep(false); setCropName(""); setCropEscala(""); setCropPreview(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  async function goToPage(n) {
    if (!pdfDocRef.current || n < 1 || n > totalPages) return;
    setCurrentPage(n);
    await renderPage(pdfDocRef.current, n);
  }

  const ns = norm(sel);
  const { w: pw, h: ph } = pageDimRef.current;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:920, maxHeight:"95vh", overflow:"hidden", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>

        {/* Header */}
        <div style={{ padding:"13px 18px", borderBottom:"1px solid #D1D9EE", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#1B3A8A" }}>Recortar sección del plano</div>
            <div style={{ fontSize:11, color:"#6B7A99", marginTop:2 }}>{file.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:"#6B7A99", cursor:"pointer", lineHeight:1, padding:"4px 8px" }}>✕</button>
        </div>

        {/* Page nav */}
        <div style={{ padding:"7px 18px", borderBottom:"1px solid #D1D9EE", display:"flex", alignItems:"center", gap:12, flexShrink:0, background:"#F4F6FB" }}>
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || rendering}
            style={{ background:"none", border:"1px solid #D1D9EE", borderRadius:6, padding:"4px 12px", fontSize:11, color:currentPage<=1||rendering?"#B8C5E0":"#2952A3", cursor:currentPage<=1||rendering?"default":"pointer", fontFamily:"inherit" }}>
            ← Anterior
          </button>
          <span style={{ fontSize:11, color:"#6B7A99", minWidth:90, textAlign:"center" }}>
            {totalPages > 0 ? `Página ${currentPage} de ${totalPages}` : "Cargando…"}
          </span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || rendering}
            style={{ background:"none", border:"1px solid #D1D9EE", borderRadius:6, padding:"4px 12px", fontSize:11, color:currentPage>=totalPages||rendering?"#B8C5E0":"#2952A3", cursor:currentPage>=totalPages||rendering?"default":"pointer", fontFamily:"inherit" }}>
            Pasar a la siguiente página →
          </button>
        </div>

        {/* Canvas */}
        <div style={{ flex:1, overflow:"auto", background:"#E8EBF3", padding:"14px" }}>
          {rendering && (
            <div style={{ textAlign:"center", padding:40, color:"#6B7A99", fontSize:13 }}>Renderizando página…</div>
          )}
          <div style={{ position:"relative", maxWidth:840, margin:"0 auto" }}>
            <canvas ref={canvasRef}
              style={{ display:"block", width:"100%", cursor:confirmStep?"default":"crosshair", userSelect:"none", opacity:rendering?0:1, borderRadius:4 }}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />
            {ns && ns.w > 5 && ns.h > 5 && !rendering && (
              <div style={{
                position:"absolute",
                left:`${(ns.x/pw)*100}%`, top:`${(ns.y/ph)*100}%`,
                width:`${(ns.w/pw)*100}%`, height:`${(ns.h/ph)*100}%`,
                border:"2px dashed #2952A3", background:"rgba(41,82,163,0.10)",
                pointerEvents:"none", borderRadius:2,
              }}/>
            )}
          </div>
        </div>

        {/* Bottom panel */}
        <div style={{ borderTop:"1px solid #D1D9EE", padding:"12px 18px", flexShrink:0, background:"#fff" }}>
          {!confirmStep ? (
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <span style={{ fontSize:11, color:"#6B7A99", flex:1 }}>
                {rendering ? "" : "Arrastra sobre el plano para seleccionar una sección"}
              </span>
              {ns && ns.w > 20 && ns.h > 20 && (
                <button onClick={handleConfirm}
                  style={{ background:"#1B3A8A", color:"#fff", border:"none", borderRadius:7, padding:"8px 20px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
                  Confirmar selección
                </button>
              )}
            </div>
          ) : (
            <div style={{ display:"flex", gap:14, flexWrap:"wrap", alignItems:"flex-start" }}>
              {cropPreview && (
                <img src={cropPreview} alt="Vista previa" style={{ height:90, maxWidth:160, borderRadius:6, border:"1px solid #D1D9EE", objectFit:"contain", background:"#F4F6FB", flexShrink:0 }} />
              )}
              <div style={{ flex:1, minWidth:220 }}>
                <div style={{ marginBottom:9 }}>
                  <label style={{ fontSize:11, color:"#3D4A5C", display:"block", marginBottom:3, fontWeight:600 }}>Nombre de la sección</label>
                  <div style={{ fontSize:10, color:"#6B7A99", marginBottom:5, fontStyle:"italic" }}>
                    Debes poner el nombre más parecido posible a la sección que estás capturando
                  </div>
                  <input autoFocus value={cropName} onChange={e => setCropName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && cropName.trim() && cropEscala) handleSave(); }}
                    placeholder="Ej: Planta primer piso, Corte A-A, Detalle escalera..."
                    style={{ width:"100%", border:"1px solid #D1D9EE", borderRadius:6, padding:"7px 10px", fontSize:12, color:"#3D4A5C", fontFamily:"inherit", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap" }}>
                  <div>
                    <label style={{ fontSize:11, color:"#3D4A5C", display:"block", marginBottom:3, fontWeight:600 }}>Escala</label>
                    <select value={cropEscala} onChange={e => setCropEscala(e.target.value)}
                      style={{ border:`1px solid ${cropEscala?"#D1D9EE":"#D68910"}`, borderRadius:6, padding:"7px 10px", fontSize:12, color:"#3D4A5C", fontFamily:"inherit", background:"#fff", cursor:"pointer" }}>
                      <option value="">— seleccionar —</option>
                      {ESCALAS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={handleSave} disabled={!cropName.trim() || !cropEscala || saving}
                    style={{ background:!cropName.trim()||!cropEscala?"#B8C5E0":"#1E8449", color:"#fff", border:"none", borderRadius:7, padding:"8px 18px", fontSize:12, fontWeight:600, cursor:!cropName.trim()||!cropEscala?"default":"pointer", fontFamily:"inherit" }}>
                    {saving ? "Guardando…" : "Guardar recorte"}
                  </button>
                  <button onClick={() => { setConfirmStep(false); setCropPreview(null); }}
                    style={{ background:"none", border:"1px solid #D1D9EE", borderRadius:7, padding:"8px 14px", fontSize:12, color:"#6B7A99", cursor:"pointer", fontFamily:"inherit" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}

          {savedCrops.length > 0 && (
            <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #EEF2FB" }}>
              <div style={{ fontSize:10, color:"#6B7A99", letterSpacing:"1px", marginBottom:6 }}>GUARDADOS EN ESTA SESIÓN</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {savedCrops.map((c, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(30,132,73,0.07)", border:"1px solid rgba(30,132,73,0.25)", borderRadius:5, padding:"3px 9px" }}>
                    <span style={{ fontSize:10, color:"#1E8449" }}>✓</span>
                    <span style={{ fontSize:10, color:"#3D4A5C" }}>Pág.{c.pagina} — {c.nombre} — {c.escala}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

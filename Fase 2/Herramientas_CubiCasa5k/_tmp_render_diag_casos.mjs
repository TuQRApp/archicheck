import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";

const seg = (p1, p2) => ({ p1, p2 });

// Clipping Liang-Barsky de un segmento contra una caja [x0,x1]x[y0,y1].
// Devuelve el sub-segmento visible, o null si cae totalmente afuera.
function recortarSegmento(p1, p2, x0, x1, y0, y1) {
  let t0 = 0, t1 = 1;
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const chequeos = [
    [-dx, p1[0] - x0], [dx, x1 - p1[0]],
    [-dy, p1[1] - y0], [dy, y1 - p1[1]],
  ];
  for (const [p, q] of chequeos) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  if (t0 > t1) return null;
  return {
    p1: [p1[0] + t0 * dx, p1[1] + t0 * dy],
    p2: [p1[0] + t1 * dx, p1[1] + t1 * dy],
  };
}

function renderCaso(nombre, propio, candidatos, opts = {}) {
  const { titulo, subtitulo } = opts;
  // Ventana LOCAL centrada en el propio segmento -- un candidato se
  // considera "cercano" por su DISTANCIA PERPENDICULAR real (ya conocida,
  // viene del log), no por distancia entre puntos medios -- un muro de
  // 12m a 7.6cm de distancia real es "cercano" aunque su punto medio este
  // lejos. Si un candidato cercano es mas largo que la ventana, se
  // RECORTA para que se vea a la misma escala que todo lo demas.
  const cx = (propio.p1[0] + propio.p2[0]) / 2, cy = (propio.p1[1] + propio.p2[1]) / 2;
  const largoPropio = Math.hypot(propio.p2[0] - propio.p1[0], propio.p2[1] - propio.p1[1]);
  const radioVentana = Math.max(largoPropio * 5, 90);
  const DIST_CERCANO_M = 0.5; // 50cm: un candidato mas cerca que esto es relevante aunque su propio largo sea grande
  const cercanos = [];
  const lejanos = [];
  for (const c of candidatos) {
    if (c.distM !== undefined && c.distM <= DIST_CERCANO_M) cercanos.push(c);
    else lejanos.push(c);
  }

  const wx0 = cx - radioVentana, wx1 = cx + radioVentana;
  const wy0 = cy - radioVentana, wy1 = cy + radioVentana;
  const cercanosRecortados = cercanos.map((c) => {
    const r = recortarSegmento(c.seg.p1, c.seg.p2, wx0, wx1, wy0, wy1);
    return r ? { ...c, seg: r } : null;
  }).filter(Boolean);
  // si el recorte dejo algo fuera de vista (no hay interseccion), pasa a lejanos igual
  const perdidos = cercanos.filter((c) => !recortarSegmento(c.seg.p1, c.seg.p2, wx0, wx1, wy0, wy1));
  lejanos.push(...perdidos);

  const todos = [propio, ...cercanosRecortados.map((c) => c.seg)];
  const xs = todos.flatMap((s) => [s.p1[0], s.p2[0]]);
  const ys = todos.flatMap((s) => [s.p1[1], s.p2[1]]);
  const minX = Math.min(...xs, wx0), maxX = Math.max(...xs, wx1);
  const minY = Math.min(...ys, wy0), maxY = Math.max(...ys, wy1);
  const margenPx = 90;
  const w = 1100, h = 800;
  const spanX = Math.max(maxX - minX, 50), spanY = Math.max(maxY - minY, 50);
  const escala = Math.min((w - margenPx * 2) / spanX, (h - margenPx * 2 - 100) / spanY);
  const offX = (w - spanX * escala) / 2 - minX * escala;
  const offY = (h - spanY * escala) / 2 + 30 - minY * escala;
  const tx = (x) => x * escala + offX;
  const ty = (y) => y * escala + offY;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px Arial";
  ctx.fillText(titulo, 30, 36);
  ctx.font = "14px Arial";
  ctx.fillStyle = "#4b5563";
  if (subtitulo) ctx.fillText(subtitulo, 30, 58);

  function dibujarSeg(s, color, ancho, dash) {
    ctx.strokeStyle = color;
    ctx.lineWidth = ancho;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(tx(s.p1[0]), ty(s.p1[1]));
    ctx.lineTo(tx(s.p2[0]), ty(s.p2[1]));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // candidatos cercanos primero (detras)
  for (const c of cercanosRecortados) {
    const color = c.solapa ? "#2563eb" : "#9ca3af";
    dibujarSeg(c.seg, color, c.solapa ? 5 : 3, c.solapa ? [] : [8, 6]);
    const mx = tx((c.seg.p1[0] + c.seg.p2[0]) / 2);
    const my = ty((c.seg.p1[1] + c.seg.p2[1]) / 2);
    ctx.fillStyle = color;
    ctx.font = "12px Arial";
    const alinearDerecha = mx > w * 0.55;
    ctx.textAlign = alinearDerecha ? "right" : "left";
    ctx.fillText(c.label, alinearDerecha ? mx - 8 : mx + 8, my - 6);
    ctx.textAlign = "left";
  }

  // segmento propio encima, en rojo grueso
  dibujarSeg(propio, "#dc2626", 7, []);
  const pmx = tx((propio.p1[0] + propio.p2[0]) / 2);
  const pmy = ty((propio.p1[1] + propio.p2[1]) / 2);
  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 13px Arial";
  ctx.fillText(nombre + " (sin par)", pmx + 10, pmy + 4);

  // candidatos lejanos: solo texto, fuera de la vista
  let ylej = h - 190;
  if (lejanos.length) {
    ctx.fillStyle = "#111827"; ctx.font = "bold 13px Arial";
    ctx.fillText("Candidatos fuera de la ventana (muy lejos para dibujar a escala):", 30, ylej);
    ctx.font = "12px Arial"; ctx.fillStyle = "#4b5563";
    for (const c of lejanos) { ylej += 18; ctx.fillText("• " + c.label, 30, ylej); }
  }

  // leyenda
  const ly = h - 90;
  ctx.font = "13px Arial";
  ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(30, ly); ctx.lineTo(70, ly); ctx.stroke();
  ctx.fillStyle = "#111827"; ctx.fillText("segmento sin par (el que se rechaza)", 80, ly + 5);
  ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(30, ly + 25); ctx.lineTo(70, ly + 25); ctx.stroke();
  ctx.fillText("candidato CON solape (lo que se evalua de verdad)", 80, ly + 30);
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(30, ly + 50); ctx.lineTo(70, ly + 50); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillText("candidato SIN solape (cerca en distancia, pero no se evalua)", 80, ly + 55);

  fs.writeFileSync(`Fase 2/Herramientas_CubiCasa5k/${nombre}_diag.png`, canvas.toBuffer("image/png"));
  console.log("guardado", nombre);
}

// === CASO 1: MU02 (N1) -- conector de esquina, sin ningun candidato con solape ===
renderCaso(
  "MU02",
  seg([996, 1560], [996, 1528]),
  [
    { seg: seg([1001, 1083], [1001, 947]), solapa: false, distM: 0.029, label: "dist=2.9cm, angulo=0°, SIN solape (otro muro, lejos en Y)" },
    { seg: seg([1001, 505], [1001, 369]), solapa: false, distM: 0.029, label: "dist=2.9cm, angulo=0°, SIN solape (otro muro, lejos en Y)" },
    { seg: seg([996, 1560], [919, 1560]), solapa: false, distM: 0.094, label: "dist=9.4cm, angulo=90° (perpendicular)" },
  ],
  { titulo: "CASO 1 — MU02: conector de esquina", subtitulo: "0.188m de largo. Ningun candidato solapa en proyeccion -- vecinos son perpendiculares, no una cara enfrentada." }
);

// === CASO 2: MU108 (N1) -- fragmento de cara sobre la misma linea, sin cara opuesta encontrada ===
renderCaso(
  "MU108",
  seg([2705, 1611], [2679, 1611]),
  [
    { seg: seg([2484, 1611], [2335, 1611]), solapa: false, distM: 0.0, label: "dist=0cm, angulo=0°, SIN solape (misma linea, mas lejos)" },
    { seg: seg([2535, 1611], [2705, 1611]), solapa: true, distM: 0.0, label: "dist=0cm -- CONTINUACION de la misma cara, no cara opuesta" },
    { seg: seg([2679, 1611], [2679, 3694]), solapa: false, distM: 0.076, label: "dist=7.6cm, angulo=90° (muro perpendicular, 12.2m)" },
  ],
  { titulo: "CASO 2 — MU108: fragmento de cara sin pareja encontrada", subtitulo: "0.153m de largo. El unico candidato con 'solape' es la continuacion de su PROPIA cara (misma linea), no la cara opuesta." }
);

// === CASO 3: MU03 / MU04 (N2) -- duplicado exacto ===
{
  const w = 1100, h = 800;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#111827"; ctx.font = "bold 22px Arial";
  ctx.fillText("CASO 3 — MU03 / MU04: duplicado exacto", 30, 36);
  ctx.font = "14px Arial"; ctx.fillStyle = "#4b5563";
  ctx.fillText("Ambas entradas de muros_geo trazan la MISMA linea (3.598m) -- coordenadas identicas invertidas.", 30, 58);
  ctx.fillText("El candidato con solape real que encuentra cada una es la otra -- a 0m de distancia, por eso se rechaza (no es un ancho real).", 30, 78);

  const p1 = [945, 1586], p2 = [1557, 1586];
  const spanX = p2[0] - p1[0];
  const escala = (w - 200) / spanX;
  const offX = 100 - p1[0] * escala;
  const cy = 300;
  const tx = (x) => x * escala + offX;

  // dibuja como 2 lineas superpuestas ligeramente separadas visualmente para que se entiendan, con nota de "en la realidad estan en el mismo lugar"
  ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(tx(p1[0]), cy - 6); ctx.lineTo(tx(p2[0]), cy - 6); ctx.stroke();
  ctx.fillStyle = "#dc2626"; ctx.font = "bold 14px Arial"; ctx.fillText("MU03  [1557,1586]-[945,1586]", tx(p1[0]), cy - 20);

  ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(tx(p1[0]), cy + 6); ctx.lineTo(tx(p2[0]), cy + 6); ctx.stroke();
  ctx.fillStyle = "#2563eb"; ctx.fillText("MU04  [945,1586]-[1557,1586]", tx(p1[0]), cy + 30);

  ctx.strokeStyle = "#9ca3af"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx(p1[0]), cy - 40); ctx.lineTo(tx(p1[0]), cy + 60); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx(p2[0]), cy - 40); ctx.lineTo(tx(p2[0]), cy + 60); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#6b7280"; ctx.font = "12px Arial";
  ctx.fillText("(separadas 12px solo para que se vean las 2 lineas -- en el plano real estan exactamente en el mismo lugar, y=1586)", tx(p1[0]), cy + 90);
  ctx.fillText("3.598m de largo total", (tx(p1[0]) + tx(p2[0])) / 2 - 60, cy + 120);

  // candidatos reales (no relacionados, sin solape)
  ctx.fillStyle = "#111827"; ctx.font = "bold 15px Arial";
  ctx.fillText("Otros candidatos encontrados cerca (ninguno solapa con la linea completa):", 30, 450);
  ctx.font = "13px Arial";
  ctx.fillText("• [596,1594]-[817,1594]  1.3m, dist=4.7cm, angulo=0° -- SIN solape (x=596-817, fuera del rango x=945-1557 de MU03/04)", 30, 480);
  ctx.fillText("• [1685,1560]-[1557,1560]  0.75m, dist=15.3cm, angulo=0° -- SIN solape (solo toca en el borde x=1557, sin superficie real)", 30, 505);
  ctx.fillText("Ninguno de los 2 cubre el tramo completo x=945-1557 en paralelo -- la cara opuesta real de este muro no aparece", 30, 535);
  ctx.fillText("en los datos extraidos, dentro de los 2m de radio local evaluados.", 30, 555);

  fs.writeFileSync("Fase 2/Herramientas_CubiCasa5k/MU03_MU04_diag.png", canvas.toBuffer("image/png"));
  console.log("guardado MU03_MU04");
}

// === CASO 4: MU11 / MU48 -- ilustrativo (sin coordenadas reales todavia) ===
{
  const w = 1100, h = 700;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#b91c1c"; ctx.font = "bold 20px Arial";
  ctx.fillText("CASO 4 — MU11 / MU48: tolerancia de conexion (ILUSTRATIVO, sin coordenadas reales todavia)", 30, 36);
  ctx.font = "14px Arial"; ctx.fillStyle = "#4b5563";
  ctx.fillText("Este caso todavia no tiene coordenadas capturadas -- el dibujo de abajo es un ejemplo generico para explicar el problema, no el caso real.", 30, 62);
  ctx.fillText("MU11 y MU48 SI tienen ambos ancho real correcto (30cm) -- el problema es solo de conectividad del relleno.", 30, 82);

  const gapPx = 40; // hueco ilustrativo
  const anchoMuroPx = 45;
  const x0 = 250, x1 = 250 + 300;
  const xGap0 = x0 + 300, xGap1 = xGap0 + gapPx;
  const y0 = 300;

  // muro A (relleno solido)
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(x0, y0 - anchoMuroPx / 2, 300, anchoMuroPx);
  ctx.fillStyle = "#111827"; ctx.font = "13px Arial";
  ctx.fillText("MU11 (relleno solido, ancho real 30cm)", x0, y0 - 40);

  // muro B
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(xGap1, y0 - anchoMuroPx / 2, 300, anchoMuroPx);
  ctx.fillText("MU48 (relleno solido, ancho real 30cm)", xGap1, y0 - 40);

  // hueco real
  ctx.strokeStyle = "#6b7280"; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(xGap0, y0 - 60); ctx.lineTo(xGap0, y0 + 60); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xGap1, y0 - 60); ctx.lineTo(xGap1, y0 + 60); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#111827"; ctx.font = "bold 13px Arial";
  ctx.fillText("hueco real entre los 2 rellenos (ej. ~6-8cm, un butt-joint normal entre tramos)", xGap0 - 60, y0 + 100);

  // dilatacion actual (chica)
  const dilPx1 = 8; // ilustra 3cm de cada lado
  ctx.fillStyle = "rgba(220,38,38,0.25)";
  ctx.fillRect(x0 - dilPx1, y0 - anchoMuroPx / 2 - dilPx1, 300 + dilPx1 * 2, anchoMuroPx + dilPx1 * 2);
  ctx.fillStyle = "rgba(37,99,235,0.25)";
  ctx.fillRect(xGap1 - dilPx1, y0 - anchoMuroPx / 2 - dilPx1, 300 + dilPx1 * 2, anchoMuroPx + dilPx1 * 2);
  ctx.fillStyle = "#7f1d1d"; ctx.font = "13px Arial";
  ctx.fillText("dilatacion actual (10% del ancho, ~3cm cada lado) -- NO llega a tocarse -> 'no conectados'", x0, y0 + 150);

  fs.writeFileSync("Fase 2/Herramientas_CubiCasa5k/MU11_MU48_diag.png", canvas.toBuffer("image/png"));
  console.log("guardado MU11_MU48 (ilustrativo)");
}

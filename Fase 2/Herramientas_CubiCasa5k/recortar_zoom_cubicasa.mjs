import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const cubi = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));
const cubiN1 = cubi.find(r => r.archivo.includes("pag2-1"));

const imgPath = "archicheck/Fase 2/Desarrollos/archicheck_geometrico_remodelacion_pdv_23jul_0618_pag2-1.png";
const img = await loadImage(imgPath);

const RECORTE_PX = 220; // zona real alrededor del punto, en px de la imagen original
const ZOOM = 3;
const cols = 4;
const rows = Math.ceil(cubiN1.puertas.length / cols);
const celda = RECORTE_PX * ZOOM;

const canvas = createCanvas(celda * cols, celda * rows);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);

cubiN1.puertas.forEach((p, i) => {
  const cx = p.cx_rel * img.width;
  const cy = p.cy_rel * img.height;
  const sx = Math.max(0, cx - RECORTE_PX / 2);
  const sy = Math.max(0, cy - RECORTE_PX / 2);

  const col = i % cols;
  const row = Math.floor(i / cols);
  const dx = col * celda;
  const dy = row * celda;

  ctx.drawImage(img, sx, sy, RECORTE_PX, RECORTE_PX, dx, dy, celda, celda);

  // cruz roja en el centro exacto del punto detectado
  const centroX = dx + (cx - sx) * ZOOM;
  const centroY = dy + (cy - sy) * ZOOM;
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centroX - 20, centroY); ctx.lineTo(centroX + 20, centroY);
  ctx.moveTo(centroX, centroY - 20); ctx.lineTo(centroX, centroY + 20);
  ctx.stroke();

  ctx.fillStyle = "red";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`C${i + 1} (${p.cx_rel},${p.cy_rel})`, dx + 6, dy + 26);

  ctx.strokeStyle = "#888";
  ctx.strokeRect(dx, dy, celda, celda);
});

fs.writeFileSync("archicheck/Fase 2/Herramientas_CubiCasa5k/zoom_puertas_cubicasa_n1.png", canvas.toBuffer("image/png"));
console.log("Guardado: zoom_puertas_cubicasa_n1.png");
console.log(`Grilla: ${cols}x${rows}, cada celda = ${RECORTE_PX}px reales alrededor del punto`);

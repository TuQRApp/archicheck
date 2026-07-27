// Grilla generica de recortes-zoom con cruz roja, para verificar visualmente
// una lista de puntos cx_rel/cy_rel contra el plano real, sin depender de
// estimacion a ojo. Uso: node zoom_grilla_generico.mjs <img> <puntos.json> <salida.png> [recortePx] [zoom]
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const [, , imgPath, ptsPath, outPath, recorteArg, zoomArg] = process.argv;
const RECORTE_PX = recorteArg ? Number(recorteArg) : 260;
const ZOOM = zoomArg ? Number(zoomArg) : 3;

const puntos = JSON.parse(fs.readFileSync(ptsPath, "utf8"));
const img = await loadImage(imgPath);

const cols = 5;
const rows = Math.ceil(puntos.length / cols);
const celda = RECORTE_PX * ZOOM;

const canvas = createCanvas(celda * cols, celda * rows);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, canvas.width, canvas.height);

puntos.forEach((p, i) => {
  const cx = p.cx_rel * img.width;
  const cy = p.cy_rel * img.height;
  const sx = Math.max(0, Math.min(img.width - RECORTE_PX, cx - RECORTE_PX / 2));
  const sy = Math.max(0, Math.min(img.height - RECORTE_PX, cy - RECORTE_PX / 2));

  const col = i % cols;
  const row = Math.floor(i / cols);
  const dx = col * celda;
  const dy = row * celda;

  ctx.drawImage(img, sx, sy, RECORTE_PX, RECORTE_PX, dx, dy, celda, celda);

  const centroX = dx + (cx - sx) * ZOOM;
  const centroY = dy + (cy - sy) * ZOOM;
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centroX - 22, centroY); ctx.lineTo(centroX + 22, centroY);
  ctx.moveTo(centroX, centroY - 22); ctx.lineTo(centroX, centroY + 22);
  ctx.stroke();

  ctx.fillStyle = "blue";
  ctx.fillRect(dx, dy, 60, 30);
  ctx.fillStyle = "white";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`#${i + 1}`, dx + 6, dy + 22);

  ctx.strokeStyle = "#888";
  ctx.strokeRect(dx, dy, celda, celda);
});

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Guardado: ${outPath}`);
console.log(`Grilla: ${cols}x${rows}, cada celda = ${RECORTE_PX}px reales alrededor del punto, zoom x${ZOOM}`);

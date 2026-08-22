import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out1 = process.argv[3];
const out2 = process.argv[4];
const img = await loadImage(src);

function render(x1, y1, w1, h1, zoom, grupoA, grupoB, labelA, labelB, out) {
  const canvas = createCanvas(w1 * zoom, h1 * zoom);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * zoom, h1 * zoom);
  const T = (x, y) => [(x - x1) * zoom, (y - y1) * zoom];

  ctx.lineWidth = 7;
  ctx.strokeStyle = "#0074d9";
  for (const [p1, p2] of grupoA) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.strokeStyle = "#ff4136";
  for (const [p1, p2] of grupoB) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.font = "bold 22px sans-serif";
  ctx.fillStyle = "#0074d9"; ctx.fillText(labelA, 10, 28);
  ctx.fillStyle = "#ff4136"; ctx.fillText(labelB, 10, 56);
  ctx.fillStyle = "black"; ctx.font = "bold 26px sans-serif";
  ctx.fillText("RECHAZADO por cuerpo cerrado", 10, h1 * zoom - 16);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("saved", out);
}

// Caso 1: pilar MU18 (azul) vs centro de ventana idx484 (rojo)
render(1930, 730, 200, 350, 2.5,
  [[[2004, 930], [2004, 939]], [[2047, 930], [2047, 939]], [[2047, 939], [2004, 939]], [[2047, 930], [2004, 930]]],
  [[[2026, 803], [2026, 930]]],
  "Grupo A = pilar real (MU18)",
  "Grupo B = centro de ventana (sin par)",
  out1);

// Caso 4: MU06 (azul) vs MU07 (rojo), separados por ventana real 2.3m
render(600, 2200, 200, 950, 1.0,
  [[[664, 2240], [664, 2461]], [[715, 2274], [715, 2461]], [[715, 2461], [664, 2461]]],
  [[[664, 2852], [664, 3103]], [[715, 2852], [715, 3103]], [[715, 2852], [664, 2852]], [[715, 3103], [664, 3103]]],
  "Grupo A = MU06 (ancho real 0.3m)",
  "Grupo B = MU07 (ancho real 0.3m) -- separados por ventana 2.3m",
  out2);

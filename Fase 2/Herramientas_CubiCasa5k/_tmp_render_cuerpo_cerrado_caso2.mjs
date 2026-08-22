import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const x1 = 2150, y1 = 1950, w1 = 250, h1 = 350;
const canvas = createCanvas(w1 * 3, h1 * 3);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * 3, h1 * 3);

const T = (x, y) => [(x - x1) * 3, (y - y1) * 3];

// grupo A (capa Muros, ya reconocido hoy) en verde
const grupoA = [
  [[2263, 2036], [2263, 2129]],
  [[2297, 2002], [2297, 2129]],
  [[2203, 2036], [2263, 2036]],
  [[2203, 2002], [2297, 2002]],
  [[2297, 2129], [2263, 2129]],
];
// grupo B (capa Proyecciones, hoy excluido -- recuperado por cuerpo cerrado) en naranjo
const grupoB = [
  [[2263, 2129], [2263, 2155]],
  [[2263, 2176], [2263, 2219]],
  [[2297, 2129], [2297, 2155]],
  [[2297, 2176], [2297, 2219]],
];

ctx.lineWidth = 8;
ctx.strokeStyle = "#2ecc40";
for (const [p1, p2] of grupoA) {
  const [ax, ay] = T(...p1), [bx, by] = T(...p2);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}
ctx.strokeStyle = "#ff851b";
for (const [p1, p2] of grupoB) {
  const [ax, ay] = T(...p1), [bx, by] = T(...p2);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}

ctx.font = "bold 22px sans-serif";
ctx.fillStyle = "#2ecc40"; ctx.fillText("A = ya reconocido (capa Muros)", 10, 30);
ctx.fillStyle = "#ff851b"; ctx.fillText("B = recuperado por cuerpo cerrado (capa Proyecciones)", 10, 58);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

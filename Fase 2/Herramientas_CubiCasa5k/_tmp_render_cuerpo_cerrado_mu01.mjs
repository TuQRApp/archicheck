import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const x1 = 850, y1 = 1470, w1 = 260, h1 = 450;
const canvas = createCanvas(w1 * 2.5, h1 * 2.5);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * 2.5, h1 * 2.5);

const T = (x, y) => [(x - x1) * 2.5, (y - y1) * 2.5];

const grupoA = [
  [[996, 1560], [919, 1560]],
  [[919, 1560], [919, 1866]],
  [[970, 1866], [919, 1866]],
];
const grupoB = [
  [[970, 1611], [970, 1866]],
  [[970, 1611], [1047, 1611]],
  [[1047, 1611], [1047, 1563]],
  [[996, 1560], [996, 1528]],
];

ctx.lineWidth = 9;
ctx.strokeStyle = "#0074d9";
for (const [p1, p2] of grupoA) {
  const [ax, ay] = T(...p1), [bx, by] = T(...p2);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}
ctx.strokeStyle = "#ff851b";
for (const [p1, p2] of grupoB) {
  const [ax, ay] = T(...p1), [bx, by] = T(...p2);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
}

// marca el punto de conexion real
const [jx, jy] = T(970, 1866);
ctx.beginPath();
ctx.arc(jx, jy, 14, 0, Math.PI * 2);
ctx.strokeStyle = "#2ecc40";
ctx.lineWidth = 4;
ctx.stroke();

ctx.font = "bold 24px sans-serif";
ctx.fillStyle = "#0074d9"; ctx.fillText("Grupo A (mitad artificial de MU01)", 10, 32);
ctx.fillStyle = "#ff851b"; ctx.fillText("Grupo B (otra mitad artificial de MU01)", 10, 62);
ctx.fillStyle = "#2ecc40"; ctx.fillText("punto de reconexion detectado", 10, 92);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const z = 1.0;
const x1 = 2100, y1 = 3480, w1 = 650, h1 = 300;
const canvas = createCanvas(w1 * z, h1 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * z, h1 * z);
const T = (x, y) => [(x - x1) * z, (y - y1) * z];

function relleno(segs, color, grosorPx) {
  ctx.strokeStyle = color; ctx.lineWidth = grosorPx * z; ctx.lineCap = "round"; ctx.globalAlpha = 0.55;
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function label(txt, x, y, color, size = 18) {
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

const grupoA = [[[2178,3720],[2297,3720]],[[2178,3668],[2178,3720]]];
const grupoA_par = [[[2178,3668],[2246,3668]]]; // la cara enfrentada que da el ancho real (0.31m)
const grupoB = [[[2297,3720],[2297,3549]],[[2297,3720],[2705,3720]],[[2297,3694],[2297,3720]]];
const grupoB_par = [[[2679,3694],[2297,3694]]]; // la cara enfrentada real que da el ancho 0.15m (verificado: pareja del brazo horizontal derecho)

relleno(grupoA, "#0074d9", 10);
relleno(grupoA_par, "#7fdbff", 10);
relleno(grupoB, "#ff851b", 10);
relleno(grupoB_par, "#ffd700", 10);

const [jx, jy] = T(2297, 3720);
ctx.beginPath(); ctx.arc(jx, jy, 12, 0, Math.PI * 2); ctx.strokeStyle = "#2ecc40"; ctx.lineWidth = 4; ctx.stroke();

label("Grupo A (azul) + su cara enfrentada (celeste, 0.31m) = ancho real", 8, 28, "black", 16);
label("Grupo B (naranjo) + su cara enfrentada (amarillo, 0.15m) = ancho real", 8, 50, "black", 16);
label("cuerpo cerrado: FUSIONA, reconectados en el cruce (verde)", 8, 72, "#2ecc40", 16);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

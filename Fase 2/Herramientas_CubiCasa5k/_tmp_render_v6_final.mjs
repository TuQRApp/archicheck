import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

function relleno(ctx, T, segs, color, grosorPx, zoom) {
  ctx.strokeStyle = color; ctx.lineWidth = grosorPx * zoom; ctx.lineCap = "round";
  ctx.globalAlpha = 0.6;
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function lineaFina(ctx, T, segs, color, grosorPx, zoom) {
  ctx.strokeStyle = color; ctx.lineWidth = grosorPx * zoom; ctx.lineCap = "round";
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
}
function label(ctx, txt, x, y, color, size = 16) {
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

const z = 2.2;
const x1 = 880, y1 = 1440, w1 = 380, h1 = 250;
const canvas = createCanvas(w1 * z, h1 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * z, h1 * z);
const T = (x, y) => [(x - x1) * z, (y - y1) * z];

const mu01_base = [[[996,1560],[919,1560]],[[919,1560],[919,1866]],[[970,1866],[919,1866]],
                    [[970,1611],[970,1866]],[[970,1611],[1047,1611]],[[1047,1611],[1047,1563]],
                    [[996,1560],[996,1528]]];
// 3 segmentos reales que faltaban: conector SW + primer tramo real de cada borde de MU01
const mu01_extension = [
  [[1052,1507],[1068,1556]],   // conector
  [[1052,1507],[1098,1492]],   // primer tramo borde interior
  [[1068,1555],[1111,1541]],   // primer tramo borde exterior
];
const pilarNE = [[[1217,1467],[1225,1518]],[[1225,1518],[1199,1522]],[[1199,1522],[1192,1471]],[[1192,1471],[1217,1467]]];
// linea central de la ventana -- unico elemento marcado como ventana, sin ancho
const ventanaCentral = [[[1098,1492],[1213,1478]]];

relleno(ctx, T, [...mu01_base, ...mu01_extension], "#2ecc40", 16, z);
relleno(ctx, T, pilarNE, "#2ecc40", 16, z);
lineaFina(ctx, T, ventanaCentral, "#ff4136", 6, z);

label(ctx, "VERDE = muro (MU01 extendido + pilar NE), SEPARADOS", 8, 24, "#2ecc40", 15);
label(ctx, "ROJO fino = ventana (solo linea central, sin ancho)", 8, 46, "#ff4136", 15);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

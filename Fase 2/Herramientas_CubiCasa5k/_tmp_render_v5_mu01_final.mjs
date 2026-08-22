import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

function relleno(ctx, T, segs, color, grosorPx, zoom) {
  ctx.strokeStyle = color; ctx.lineWidth = grosorPx * zoom; ctx.lineCap = "round";
  ctx.globalAlpha = 0.55;
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.globalAlpha = 1;
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

const mu01 = [[[996,1560],[919,1560]],[[919,1560],[919,1866]],[[970,1866],[919,1866]],
              [[970,1611],[970,1866]],[[970,1611],[1047,1611]],[[1047,1611],[1047,1563]],
              [[996,1560],[996,1528]]];
const pilarNE = [[[1217,1467],[1225,1518]],[[1225,1518],[1199,1522]],[[1199,1522],[1192,1471]],[[1192,1471],[1217,1467]]];
const curvaInterior = [[[1052,1507],[1098,1492]],[[1098,1492],[1144,1480]],[[1144,1480],[1192,1471]],
                        [[1192,1471],[1200,1470]],[[1200,1470],[1209,1468]],[[1209,1468],[1217,1467]]];
const curvaExterior = [[[1068,1555],[1111,1541]],[[1111,1541],[1155,1530]],[[1155,1530],[1199,1522]],
                        [[1199,1522],[1208,1520]],[[1208,1520],[1216,1519]],[[1216,1519],[1225,1518]]];
const conectorSW = [[[1052,1507],[1068,1556]]];
const centro = [[[1063,1543],[1213,1481]]];
// la ventana es UNA sola unidad: 2 bordes enfrentados + linea central -- corta el muro en ambos extremos
const ventanaCompleta = [...curvaInterior, ...curvaExterior, ...conectorSW, ...centro];

relleno(ctx, T, ventanaCompleta, "#ff4136", 22, z);
relleno(ctx, T, mu01, "#2ecc40", 16, z);
relleno(ctx, T, pilarNE, "#2ecc40", 16, z);

label(ctx, "VERDE = muro (MU01 y pilar NE, SEPARADOS)", 8, 24, "#2ecc40", 16);
label(ctx, "ROJO = ventana (2 bordes + linea central = 1 sola unidad, corta el muro)", 8, 46, "#ff4136", 15);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

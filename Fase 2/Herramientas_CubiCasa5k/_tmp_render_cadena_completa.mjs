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
function label(ctx, txt, x, y, color, size = 15) {
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

const z = 1.1;
const x1 = 870, y1 = 1400, w1 = 1250, h1 = 500;
const canvas = createCanvas(w1 * z, h1 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * z, h1 * z);
const T = (x, y) => [(x - x1) * z, (y - y1) * z];

// MU01 (ya validado) -- extendido con sus 2 cierres reales
const mu01 = [[[996,1560],[919,1560]],[[919,1560],[919,1866]],[[970,1866],[919,1866]],
              [[970,1611],[970,1866]],[[970,1611],[1047,1611]],[[1047,1611],[1047,1563]],
              [[996,1560],[996,1528]],
              [[1052,1507],[1033,1514]],[[1033,1514],[1014,1521]],[[1014,1521],[996,1528]],
              [[1068,1555],[1061,1558]],[[1061,1558],[1054,1560]],[[1054,1560],[1047,1563]],
              [[1052,1507],[1068,1556]]];
// pilar 1
const pilar1 = [[[1217,1467],[1225,1518]],[[1225,1518],[1199,1522]],[[1199,1522],[1192,1471]],[[1192,1471],[1217,1467]]];
// pilar 2
const pilar2 = [[[1514,1471],[1506,1522]],[[1506,1522],[1481,1518]],[[1481,1518],[1488,1467]],[[1488,1467],[1514,1471]]];
// conexion hacia MU05/MU16 (cierres reales, mismo patron que MU01)
const cierreMU05 = [[[1659,1563],[1652,1560]],[[1652,1560],[1645,1558]],[[1645,1558],[1637,1555]],
                     [[1654,1507],[1637,1556]], // remate
                     [[1659,1611],[1659,1563]]]; // MU05 real (idx194)
const cierreMU16 = [[[1710,1528],[1691,1521]],[[1691,1521],[1673,1514]],[[1673,1514],[1654,1507]],
                     [[1710,1560],[1710,1528]]]; // MU16 real (idx195)

// MU05 y MU16 completos (cuerpos reales ya reconocidos por el pipeline)
const mu05 = [[[1736,1611],[1659,1611]],[[1659,1611],[1659,1563]],[[1736,1611],[1736,1628]],
              [[1786,1628],[1736,1628]],[[1821,1611],[1786,1611]],[[1786,1611],[1786,1628]],
              [[1821,1781],[1821,1611]],[[1786,1781],[1736,1781]],[[1736,1781],[1736,2223]],
              [[1736,2223],[1786,2223]],[[1786,1781],[1821,1781]]];
// CORREGIDO: (2335,1585)-(1944,1585) NO es MU16 -- es la linea central de una ventana
// (op#1000: rectangulo cerrado real 1944-2335 x 1560-1611; op#1001 corre justo por el
// medio, y=1585 = punto medio exacto entre 1560 y 1611). Sacada del verde.
const mu16 = [[[1944,1611],[1838,1611]],[[1944,1560],[1944,1611]],
              [[1944,1560],[1710,1560]],[[1838,1798],[1838,1611]],[[1786,1798],[1786,2002]],
              [[1786,1798],[1838,1798]],[[1710,1560],[1710,1528]]];
const ventanaMU16 = [[[2335,1585],[1944,1585]]];

// ventanas: centro real (W1, W3) + linea unica encontrada para W2 (menor certeza)
const ventana1 = [[[1196,1496],[1150,1505]],[[1150,1505],[1105,1516]],[[1105,1516],[1060,1531]]];
const ventana2 = [[[1488,1467],[1398,1454]],[[1398,1454],[1307,1454]],[[1307,1454],[1217,1467]]];
const ventana3 = [[[1646,1531],[1601,1516]],[[1601,1516],[1556,1505]],[[1556,1505],[1509,1496]]];

relleno(ctx, T, [...mu01, ...cierreMU05, ...cierreMU16, ...mu05, ...mu16], "#2ecc40", 14, z);
relleno(ctx, T, pilar1, "#2ecc40", 14, z);
relleno(ctx, T, pilar2, "#2ecc40", 14, z);
lineaFina(ctx, T, ventana1, "#ff4136", 5, z);
lineaFina(ctx, T, ventana3, "#ff4136", 5, z);
lineaFina(ctx, T, ventana2, "#888888", 5, z); // gris = sin clasificar, no cumple ningun criterio confirmado
lineaFina(ctx, T, ventanaMU16, "#ff4136", 5, z); // ventana encontrada en la re-auditoria (op#1000+op#1001)

label(ctx, "VERDE = muro/pilar (MU01, pilar1, pilar2, cierres hacia MU05/MU16) -- todos SEPARADOS", 8, 22, "#2ecc40", 14);
label(ctx, "ROJO = ventana (linea central real, W1, W3 y la de MU16 -- corregida)", 8, 42, "#ff4136", 14);
label(ctx, "GRIS = SIN CLASIFICAR entre pilar1 y pilar2 (1 sola linea, sin par -> no es muro; sin centro -> no es ventana)", 8, 62, "#888888", 13);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

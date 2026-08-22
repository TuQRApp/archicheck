import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const img = await loadImage(src);

function crop(x1, y1, w1, h1, zoom) {
  const canvas = createCanvas(w1 * zoom, h1 * zoom);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x1, y1, w1, h1, 0, 0, w1 * zoom, h1 * zoom);
  const T = (x, y) => [(x - x1) * zoom, (y - y1) * zoom];
  return { canvas, ctx, T };
}
function relleno(ctx, T, segs, color, grosorPx, zoom) {
  ctx.strokeStyle = color; ctx.lineWidth = grosorPx * zoom; ctx.lineCap = "round";
  ctx.globalAlpha = 0.55;
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function label(ctx, txt, x, y, color, size = 18) {
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

// ── A) Pilares MU18 + MU19 = VERDE (muro). Ventanas = ROJO ───────────────
{
  const z = 2.2;
  const { canvas, ctx, T } = crop(1930, 730, 200, 420, z);
  const mu18 = [[[2004,930],[2004,939]],[[2047,939],[2004,939]],[[2047,930],[2004,930]],[[2047,930],[2047,939]]];
  const mu19 = [[[2004,1066],[2004,1075]],[[2047,1066],[2004,1066]],[[2047,1075],[2004,1075]],[[2047,1066],[2047,1075]]];
  const ventanas = [[[2026,803],[2026,930]],[[2026,939],[2026,1066]]];
  relleno(ctx, T, ventanas, "#ff4136", 22, z);
  relleno(ctx, T, mu18, "#2ecc40", 16, z);
  relleno(ctx, T, mu19, "#2ecc40", 16, z);
  label(ctx, "VERDE = muro (MU18, MU19 -- pilares reales)", 8, 24, "#2ecc40");
  label(ctx, "ROJO = ventana", 8, 48, "#ff4136");
  fs.writeFileSync(process.argv[3], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[3]);
}

// ── B) Cocina MU06 + MU07 = VERDE (muro). Ventana entre medio = ROJO ─────
{
  const z = 1.0;
  const { canvas, ctx, T } = crop(600, 2200, 220, 950, z);
  const mu06 = [[[775,2240],[775,2274]],[[775,2274],[715,2274]],[[715,2274],[715,2461]],
                [[715,2461],[664,2461]],[[664,2461],[664,2240]],[[664,2240],[775,2240]]];
  const mu07 = [[[715,2852],[715,3103]],[[715,2852],[664,2852]],
                [[664,2852],[664,3103]],[[715,3103],[664,3103]]];
  const ventana = [[[690,2461],[690,2852]]];
  relleno(ctx, T, ventana, "#ff4136", 30, z);
  relleno(ctx, T, mu06, "#2ecc40", 22, z);
  relleno(ctx, T, mu07, "#2ecc40", 22, z);
  label(ctx, "VERDE = muro (MU06, MU07)", 8, 26, "#2ecc40", 20);
  label(ctx, "ROJO = ventana real (2.3m, separa los 2 muros)", 8, 52, "#ff4136", 20);
  fs.writeFileSync(process.argv[4], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[4]);
}

// ── C) MU01 + pilar NE = VERDE (muro). Arco completo = ROJO (ventana) ────
{
  const z = 2.2;
  const { canvas, ctx, T } = crop(880, 1440, 380, 250, z);
  const mu01 = [[[996,1560],[919,1560]],[[919,1560],[919,1866]],[[970,1866],[919,1866]],
                [[970,1611],[970,1866]],[[970,1611],[1047,1611]],[[1047,1611],[1047,1563]],
                [[996,1560],[996,1528]]];
  const pilarNE = [[[1217,1467],[1225,1518]],[[1225,1518],[1199,1522]],[[1199,1522],[1192,1471]],[[1192,1471],[1217,1467]]];
  const curvaInterior = [[[1052,1507],[1098,1492]],[[1098,1492],[1144,1480]],[[1144,1480],[1192,1471]],
                          [[1192,1471],[1200,1470]],[[1200,1470],[1209,1468]],[[1209,1468],[1217,1467]]];
  const curvaExterior = [[[1068,1555],[1111,1541]],[[1111,1541],[1155,1530]],[[1155,1530],[1199,1522]],
                          [[1199,1522],[1208,1520]],[[1208,1520],[1216,1519]],[[1216,1519],[1225,1518]]];
  const conectorSW = [[[1052,1507],[1068,1556]]];
  const ventanaCurva = [...curvaInterior, ...curvaExterior, ...conectorSW];
  relleno(ctx, T, ventanaCurva, "#ff4136", 24, z);
  relleno(ctx, T, mu01, "#2ecc40", 16, z);
  relleno(ctx, T, pilarNE, "#2ecc40", 16, z);
  label(ctx, "VERDE = muro (MU01 + pilar NE)", 8, 24, "#2ecc40", 17);
  label(ctx, "ROJO = ventana curva completa (2 bordes + linea central)", 8, 48, "#ff4136", 16);
  fs.writeFileSync(process.argv[5], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[5]);
}

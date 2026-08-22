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
function drawSegs(ctx, T, segs, color, width = 7) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  for (const [p1, p2] of segs) {
    const [ax, ay] = T(...p1), [bx, by] = T(...p2);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
}
function label(ctx, txt, x, y, color, size = 22) {
  ctx.font = `bold ${size}px sans-serif`; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}

// ── 1) Cocina: MU06 L-invertida (azul) + MU07 rectangulo (rojo) ──────────
{
  const { canvas, ctx, T } = crop(600, 2200, 220, 950, 1.0);
  const mu06 = [[[775,2240],[775,2274]],[[775,2274],[715,2274]],[[715,2274],[715,2461]],
                [[715,2461],[664,2461]],[[664,2461],[664,2240]],[[664,2240],[775,2240]]];
  const mu07 = [[[715,2852],[715,3103]],[[715,2852],[664,2852]],
                [[664,2852],[664,3103]],[[715,3103],[664,3103]]];
  drawSegs(ctx, T, mu06, "#0074d9");
  drawSegs(ctx, T, mu07, "#ff4136");
  label(ctx, "MU06 = L invertida cerrada (auto-cierre OK)", 8, 26, "#0074d9", 18);
  label(ctx, "MU07 = rectangulo cerrado (auto-cierre OK)", 8, 50, "#ff4136", 18);
  label(ctx, "RECHAZADO entre si (ventana real 2.3m)", 8, canvas.height - 14, "black", 20);
  fs.writeFileSync(process.argv[3], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[3]);
}

// ── 2) Pilares: MU18 (azul) + MU19 (morado) + ventana (rojo) ─────────────
{
  const { canvas, ctx, T } = crop(1930, 730, 200, 420, 2.2);
  const mu18 = [[[2004,930],[2004,939]],[[2047,939],[2004,939]],[[2047,930],[2004,930]],[[2047,930],[2047,939]]];
  const mu19 = [[[2004,1066],[2004,1075]],[[2047,1066],[2004,1066]],[[2047,1075],[2004,1075]],[[2047,1066],[2047,1075]]];
  const ventana = [[[2026,803],[2026,930]],[[2026,939],[2026,1066]]];
  drawSegs(ctx, T, ventana, "#ff4136", 5);
  drawSegs(ctx, T, mu18, "#0074d9");
  drawSegs(ctx, T, mu19, "#b10dc9");
  label(ctx, "MU18 (azul) y MU19 (morado): 2 pilares, misma forma/orientacion, ambos auto-cierran", 8, 26, "black", 15);
  label(ctx, "rojo = centro de ventana entre y sobre ellos (sin par, rechazado)", 8, 50, "#ff4136", 15);
  fs.writeFileSync(process.argv[4], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[4]);
}

// ── 3) MU01 + brazo curvo (arco) -- reporta el gap real sin forzarlo ─────
{
  const { canvas, ctx, T } = crop(880, 1440, 380, 250, 2.2);
  const mu01 = [[[996,1560],[919,1560]],[[919,1560],[919,1866]],[[970,1866],[919,1866]],
                [[970,1611],[970,1866]],[[970,1611],[1047,1611]],[[1047,1611],[1047,1563]],
                [[996,1560],[996,1528]]];
  const curvaInterior = [[[1052,1507],[1098,1492]],[[1098,1492],[1144,1480]],[[1144,1480],[1192,1471]],
                          [[1192,1471],[1200,1470]],[[1200,1470],[1209,1468]],[[1209,1468],[1217,1467]]];
  const curvaExterior = [[[1068,1555],[1111,1541]],[[1111,1541],[1155,1530]],[[1155,1530],[1199,1522]],
                          [[1199,1522],[1208,1520]],[[1208,1520],[1216,1519]],[[1216,1519],[1225,1518]]];
  const conectorSW = [[[1052,1507],[1068,1556]]];
  const remateNE = [[[1217,1467],[1225,1518]]];
  drawSegs(ctx, T, mu01, "#0074d9");
  drawSegs(ctx, T, curvaInterior, "#2ecc40");
  drawSegs(ctx, T, curvaExterior, "#2ecc40");
  drawSegs(ctx, T, conectorSW, "#ff851b");
  drawSegs(ctx, T, remateNE, "#ff851b", 9);
  // marca el gap real detectado entre MU01 y el brazo curvo
  const [gx1, gy1] = T(1047, 1563), [gx2, gy2] = T(1068, 1556);
  ctx.strokeStyle = "red"; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx2, gy2); ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "MU01 (azul) + brazo curvo (verde) + remate NE (naranjo)", 8, 26, "black", 16);
  label(ctx, "gap real detectado aqui: ~0.13m -- NO conecta con la tolerancia actual", 8, 50, "red", 15);
  fs.writeFileSync(process.argv[5], canvas.toBuffer("image/png"));
  console.log("saved", process.argv[5]);
}

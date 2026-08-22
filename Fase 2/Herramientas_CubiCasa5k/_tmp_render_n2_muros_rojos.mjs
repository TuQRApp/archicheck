import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const N1_X_MAX = 2861;
// bbox_px (pagina completa) de cada rectangulo rojo solido encontrado, ya
// convertido a x local de N2 (resta N1_X_MAX)
const rects = [
  { x0: 850, y0: 1663, x1: 867, y1: 1799 },   // op#4487
  { x0: 595, y0: 1595, x1: 816, y1: 2241 },   // op#4590
  { x0: 867, y0: 2171, x1: 1402, y1: 2188 },  // op#5062
  { x0: 1148, y0: 2590, x1: 1182, y1: 2726 }, // op#5108
  { x0: 612, y0: 2445, x1: 833, y1: 2590 },   // op#5397
  { x0: 969, y0: 2564, x1: 1046, y1: 2590 },  // op#5475
  { x0: 2177, y0: 1595, x1: 2398, y1: 2411 }, // op#5660
  { x0: 2194, y0: 2394, x1: 2381, y1: 2411 }, // op#5690
  { x0: 1684, y0: 1595, x1: 1786, y1: 1612 }, // op#5710
  { x0: 1930, y0: 1595, x1: 2032, y1: 1612 }, // op#5730
  { x0: 1538, y0: 2171, x1: 1633, y1: 2188 }, // op#5765
  { x0: 893, y0: 2870, x1: 1029, y1: 2887 },  // op#5912
  { x0: 1403, y0: 2921, x1: 1420, y1: 3129 }, // op#5944
  { x0: 1403, y0: 3431, x1: 1420, y1: 3670 }, // op#5980
];

const z = 0.55;
const canvas = createCanvas(2790 * z, 3900 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 0, 0, 2790, 3900, 0, 0, 2790 * z, 3900 * z);

ctx.strokeStyle = "#2ecc40";
ctx.lineWidth = 3;
ctx.font = "bold 13px sans-serif";
rects.forEach((r, i) => {
  ctx.strokeRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  ctx.fillStyle = "#2ecc40";
  ctx.fillText(String(i + 1), r.x0 * z, r.y0 * z - 4);
});

ctx.font = "bold 20px sans-serif";
ctx.fillStyle = "black";
ctx.fillText(`N2 -- ${rects.length} muros rojo-achurados encontrados, ninguno en muros_geo hoy`, 10, 26);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

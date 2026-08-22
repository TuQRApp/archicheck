import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const muros = [
  { x0: 850, y0: 1663, x1: 867, y1: 1799 },   // 1
  { x0: 867, y0: 2171, x1: 1402, y1: 2188 },  // 2
  { x0: 1148, y0: 2590, x1: 1182, y1: 2726 }, // 3
  { x0: 595, y0: 1594, x1: 817, y1: 2241 },   // 4 (Muro2 = MU03+MU26)
  { x0: 969, y0: 2564, x1: 1046, y1: 2590 },  // 5
  { x0: 612, y0: 2445, x1: 834, y1: 2590 },   // 6 (Muro5 = MU17+MU19+MU29)
  { x0: 2177, y0: 1595, x1: 2398, y1: 2411 }, // 7 (Muro7-8 = MU13)
  { x0: 1684, y0: 1595, x1: 1786, y1: 1612 }, // 8
  { x0: 1930, y0: 1595, x1: 2032, y1: 1612 }, // 9
  { x0: 1538, y0: 2171, x1: 1633, y1: 2188 }, // 10
  { x0: 893, y0: 2870, x1: 1029, y1: 2887 },  // 11
  { x0: 1403, y0: 2921, x1: 1420, y1: 3129 }, // 12
  { x0: 1403, y0: 3431, x1: 1420, y1: 3670 }, // 13
];

const z = 0.55;
const canvas = createCanvas(2790 * z, 3900 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 0, 0, 2790, 3900, 0, 0, 2790 * z, 3900 * z);

ctx.strokeStyle = "#ff851b";
ctx.fillStyle = "rgba(255,133,27,0.35)";
ctx.lineWidth = 3;
ctx.font = "bold 16px sans-serif";
muros.forEach((r, i) => {
  ctx.fillRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  ctx.strokeRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  const cx = ((r.x0 + r.x1) / 2) * z, cy = ((r.y0 + r.y1) / 2) * z;
  ctx.fillStyle = "black";
  ctx.fillText(String(i + 1), cx - 5, cy + 5);
  ctx.fillStyle = "rgba(255,133,27,0.35)";
});

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

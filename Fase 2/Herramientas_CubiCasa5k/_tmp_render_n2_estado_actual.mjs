import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

// ── 3 confirmados genuinamente faltantes: relleno real ───────────────────
const faltantes = {
  op5062: [seg([867,2171],[1402,2171]), seg([1402,2171],[1402,2188]), seg([1402,2188],[867,2188]), seg([867,2188],[867,2171]),
           seg([817,1799],[817,2241]), seg([868,1799],[868,2258])], // + contexto MU14
  op5710: [seg([1786,1612],[1684,1612]), seg([1684,1612],[1684,1595]), seg([1684,1595],[1786,1595]), seg([1786,1595],[1786,1612]),
           seg([1685,1560],[1685,2003]), seg([1634,1612],[1634,2188])], // + contexto MU01
  op5730: [seg([2032,1612],[1930,1612]), seg([1930,1612],[1930,1595]), seg([1930,1595],[2032,1595]), seg([2032,1595],[2032,1612])],
};

const z = 0.55;
const canvas = createCanvas(2790 * z, 3900 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 0, 0, 2790, 3900, 0, 0, 2790 * z, 3900 * z);

for (const [label, ctxSegs] of Object.entries(faltantes)) {
  const relleno = rellenoSolidoDeContexto(ctxSegs, mpx, 0.15);
  const { box, w, h, bin } = relleno;
  const region = ctx.getImageData(box.x0 * z, box.y0 * z, Math.ceil(w * z), Math.ceil(h * z));
  for (let y = 0; y < Math.ceil(h * z); y++) {
    for (let x = 0; x < Math.ceil(w * z); x++) {
      const sx = Math.floor(x / z), sy = Math.floor(y / z);
      if (sx < w && sy < h && bin[sy * w + sx]) {
        const idx = (y * Math.ceil(w * z) + x) * 4;
        region.data[idx] = Math.round(region.data[idx] * 0.3 + 255 * 0.7);
        region.data[idx + 1] = Math.round(region.data[idx + 1] * 0.3 + 65 * 0.7);
        region.data[idx + 2] = Math.round(region.data[idx + 2] * 0.3 + 54 * 0.7);
      }
    }
  }
  ctx.putImageData(region, box.x0 * z, box.y0 * z);
}

// ── 7 ya presentes, solo sin fusionar: outline naranja + label ──────────
const necesitanFusion = [
  { op: "4487", x0: 850, y0: 1663, x1: 867, y1: 1799, ids: "MU02+MU14" },
  { op: "5108", x0: 1148, y0: 2590, x1: 1182, y1: 2726, ids: "MU12+MU27" },
  { op: "5475", x0: 969, y0: 2564, x1: 1046, y1: 2590, ids: "MU27+MU28" },
  { op: "5765", x0: 1538, y0: 2171, x1: 1633, y1: 2188, ids: "MU01" },
  { op: "5912", x0: 893, y0: 2870, x1: 1029, y1: 2887, ids: "MU08+MU12" },
  { op: "5944", x0: 1403, y0: 2921, x1: 1420, y1: 3129, ids: "MU09+MU10" },
  { op: "5980", x0: 1403, y0: 3431, x1: 1420, y1: 3670, ids: "MU10+MU30" },
];
ctx.strokeStyle = "#ff851b";
ctx.lineWidth = 3;
ctx.font = "bold 12px sans-serif";
necesitanFusion.forEach((r) => {
  ctx.strokeRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  ctx.fillStyle = "#ff851b";
  ctx.fillText(r.ids, r.x0 * z, r.y0 * z - 4);
});

// Muro 2, Muro 5, Muro 7-8: ya confirmados via cuerpo cerrado (verde)
ctx.strokeStyle = "#2ecc40";
ctx.lineWidth = 3;
[[595,1595,816,2241],[612,2445,833,2590],[2177,1595,2398,2411]].forEach(([x0,y0,x1,y1]) => {
  ctx.strokeRect(x0*z, y0*z, (x1-x0)*z, (y1-y0)*z);
});

ctx.font = "bold 20px sans-serif";
ctx.fillStyle = "black";
ctx.fillText("ROJO = genuinamente faltante (relleno real)  |  NARANJO = ya en muros_geo, falta fusionar  |  VERDE = confirmado hoy", 10, 26);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

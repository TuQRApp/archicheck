import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const z = 0.55;
const canvas = createCanvas(2790 * z, 3900 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 0, 0, 2790, 3900, 0, 0, 2790 * z, 3900 * z);

function pintarRelleno(bin, box, w, h) {
  const region = ctx.getImageData(box.x0 * z, box.y0 * z, Math.ceil(w * z), Math.ceil(h * z));
  for (let y = 0; y < Math.ceil(h * z); y++) {
    for (let x = 0; x < Math.ceil(w * z); x++) {
      const sx = Math.floor(x / z), sy = Math.floor(y / z);
      if (sx < w && sy < h && bin[sy * w + sx]) {
        const idx = (y * Math.ceil(w * z) + x) * 4;
        region.data[idx] = Math.round(region.data[idx] * 0.3 + 255 * 0.7);
        region.data[idx + 1] = Math.round(region.data[idx + 1] * 0.3 + 133 * 0.7);
        region.data[idx + 2] = Math.round(region.data[idx + 2] * 0.3 + 27 * 0.7);
      }
    }
  }
  ctx.putImageData(region, box.x0 * z, box.y0 * z);
}

function numero(n, cx, cy) {
  ctx.font = "bold 16px sans-serif"; ctx.fillStyle = "black";
  ctx.fillText(String(n), cx * z - 5, cy * z + 5);
}

// rectangulos simples (confirmados, 5 puntos reales)
const rects = {
  1: { x0: 850, y0: 1663, x1: 867, y1: 1799 },
  2: { x0: 867, y0: 2171, x1: 1402, y1: 2188 },
  3: { x0: 1148, y0: 2590, x1: 1182, y1: 2726 },
  5: { x0: 969, y0: 2564, x1: 1046, y1: 2590 },
  8: { x0: 1684, y0: 1595, x1: 1786, y1: 1612 },
  9: { x0: 1930, y0: 1595, x1: 2032, y1: 1612 },
  10: { x0: 1538, y0: 2171, x1: 1633, y1: 2188 },
  11: { x0: 893, y0: 2870, x1: 1029, y1: 2887 },
  12: { x0: 1403, y0: 2921, x1: 1420, y1: 3129 },
  13: { x0: 1403, y0: 3431, x1: 1420, y1: 3670 },
};
for (const [n, r] of Object.entries(rects)) {
  ctx.fillStyle = "rgba(255,133,27,0.55)";
  ctx.fillRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  ctx.strokeStyle = "#ff851b"; ctx.lineWidth = 2;
  ctx.strokeRect(r.x0 * z, r.y0 * z, (r.x1 - r.x0) * z, (r.y1 - r.y0) * z);
  numero(n, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
}

// 4: Muro2 = MU03 + MU26, forma real en L
// SOLO el tramo de MU03 que cae dentro de la extension real del poligono
// rojo (op#4590, y=1594-2241) -- MU03 real sigue mas abajo (562-613,
// 2241-2530) pero eso es OTRO muro preexistente sin relacion con este,
// no debe mostrarse en este analisis de muros rojos.
const mu03 = [seg([613,1612],[613,2241]),seg([613,2241],[596,2241]),seg([596,2241],[596,1612])];
const mu26 = [seg([817,1612],[613,1612]),seg([596,1594],[817,1594]),seg([817,1594],[817,1612]),seg([596,1612],[596,1594])];
{
  const r = rellenoSolidoDeContexto([...mu03, ...mu26], mpx, 0.15);
  pintarRelleno(r.bin, r.box, r.w, r.h);
  numero(4, 700, 1900);
}

// 6: Muro5 = MU17+MU19+MU29, forma real en L
const derecha = [seg([817,2572],[817,2445]), seg([834,2445],[834,2572]), seg([817,2445],[834,2445])];
const mu29 = [seg([613,2572],[817,2572]),seg([834,2590],[613,2590]),seg([613,2590],[613,2572]),seg([834,2572],[834,2590])];
{
  const r = rellenoSolidoDeContexto([...derecha, ...mu29], mpx, 0.15);
  pintarRelleno(r.bin, r.box, r.w, r.h);
  numero(6, 720, 2510);
}

// 7: Muro7-8 = MU13 (op#5660 + op#5690), forma real en C
const c1 = [seg([2381,2411],[2398,2411]),seg([2398,2411],[2398,1612]),seg([2398,1612],[2398,1595]),
            seg([2398,1595],[2177,1595]),seg([2177,1595],[2177,1612]),seg([2177,1612],[2381,1612]),
            seg([2381,1612],[2381,2394])];
const c2 = [seg([2381,2411],[2194,2411]),seg([2194,2411],[2194,2394]),seg([2194,2394],[2381,2394])];
{
  const r = rellenoSolidoDeContexto([...c1, ...c2], mpx, 0.15);
  pintarRelleno(r.bin, r.box, r.w, r.h);
  numero(7, 2260, 2000);
}

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

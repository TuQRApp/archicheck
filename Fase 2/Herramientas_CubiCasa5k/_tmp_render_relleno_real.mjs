import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { cuerpoCerradoFusiona } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const grupoA = [seg([2178,3720],[2297,3720]), seg([2178,3668],[2178,3720])];
const grupoB = [seg([2297,3720],[2297,3549]), seg([2297,3720],[2705,3720]), seg([2297,3694],[2297,3720])];
const contexto = [
  ...grupoA, ...grupoB,
  seg([2178,3668],[2246,3668]),
  seg([2297,3549],[2365,3549]),
  seg([2679,3694],[2297,3694]),
  seg([2246,2444],[2246,3668]),
  seg([2679,1611],[2679,3694]),
];

const r = cuerpoCerradoFusiona(grupoA, grupoB, contexto, mpx);
console.log("fusiona:", r.fusiona, r.motivo);

const { box, w, h, componente } = r.raster;

const z = 1.0;
const canvas = createCanvas(w * z, h * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, box.x0, box.y0, w, h, 0, 0, w * z, h * z);

// dibuja el relleno real (componente conectado) como overlay verde traslucido
const overlay = ctx.getImageData(0, 0, w * z, h * z);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (componente[y * w + x]) {
      const i = (y * z * (w * z) + x * z) * 4;
      // pinta un bloque zxz (z=1 aca, un pixel real)
      const idx = (y * (w * z) + x) * 4;
      overlay.data[idx] = Math.round(overlay.data[idx] * 0.3 + 46 * 0.7);
      overlay.data[idx + 1] = Math.round(overlay.data[idx + 1] * 0.3 + 204 * 0.7);
      overlay.data[idx + 2] = Math.round(overlay.data[idx + 2] * 0.3 + 64 * 0.7);
    }
  }
}
ctx.putImageData(overlay, 0, 0);

ctx.font = "bold 16px sans-serif";
ctx.fillStyle = "black";
ctx.fillText(`cuerpo cerrado (relleno real, flood-fill): fusiona=${r.fusiona}`, 8, 20);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

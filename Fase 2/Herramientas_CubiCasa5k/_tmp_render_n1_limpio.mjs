import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const z = 1.0;
const canvas = createCanvas(2860 * z, 1000 * z);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, 1650, 1950, 2860 - 1650, 1000, 0, 0, (2860 - 1650) * z, 1000 * z);
const OX = 1650, OY = 1950;

function pintar(bin, box, w, h) {
  const region = ctx.getImageData((box.x0 - OX) * z, (box.y0 - OY) * z, Math.ceil(w * z), Math.ceil(h * z));
  for (let y = 0; y < Math.ceil(h * z); y++) for (let x = 0; x < Math.ceil(w * z); x++) {
    const sx = Math.floor(x / z), sy = Math.floor(y / z);
    if (sx < w && sy < h && bin[sy * w + sx]) {
      const idx = (y * Math.ceil(w * z) + x) * 4;
      region.data[idx] = Math.round(region.data[idx] * 0.3 + 255 * 0.7);
      region.data[idx + 1] = Math.round(region.data[idx + 1] * 0.3 + 133 * 0.7);
      region.data[idx + 2] = Math.round(region.data[idx + 2] * 0.3 + 27 * 0.7);
    }
  }
  ctx.putImageData(region, (box.x0 - OX) * z, (box.y0 - OY) * z);
}
function numero(n, cx, cy) {
  ctx.font = "bold 22px sans-serif"; ctx.fillStyle = "black";
  ctx.fillText(String(n), (cx - OX) * z - 6, (cy - OY) * z + 7);
}

const mu13 = [seg([2263,2036],[2263,2129]), seg([2297,2002],[2297,2129]), seg([2203,2036],[2263,2036]),
              seg([2203,2002],[2297,2002]), seg([2297,2129],[2263,2129]), seg([2203,2002],[2203,2036]),
              seg([2203,2036],[2203,2129]), seg([2203,2129],[2263,2129])];
const mu05 = [seg([1736,2223],[1786,2223])];
const mu12 = [seg([1736,2376],[1786,2376]), seg([1786,2393],[1829,2393]), seg([1786,2376],[1786,2393])];

// 1: muro izquierdo (mu05/mu12 solo dan contexto, no se pintan)
{
  const muroIzq = [seg([1770,2223],[1787,2223]), seg([1787,2223],[1787,2376]), seg([1787,2376],[1770,2376]), seg([1770,2376],[1770,2223])];
  const r = rellenoSolidoDeContexto([...muroIzq, ...mu05, ...mu12], mpx, 0.15, muroIzq);
  pintar(r.bin, r.box, r.w, r.h);
  numero(1, 1778, 2300);
}
// 2: muro lateral (1.55m) -- mu13 solo da contexto, no se pinta
{
  const muroLateral = [seg([2280,2129],[2297,2129]), seg([2297,2129],[2297,2393]), seg([2297,2393],[2280,2393]), seg([2280,2393],[2280,2129])];
  const r = rellenoSolidoDeContexto([...muroLateral, ...mu13], mpx, 0.15, muroLateral);
  pintar(r.bin, r.box, r.w, r.h);
  numero(2, 2289, 2260);
}
// 3: muro superior (2.9m) -- mu13 solo da contexto, no se pinta
{
  const muroSuperior = [seg([2203,2112],[2203,2129]), seg([2203,2129],[1787,2129]), seg([1787,2129],[1787,2112]), seg([1787,2112],[2203,2112])];
  const r = rellenoSolidoDeContexto([...muroSuperior, ...mu13], mpx, 0.15, muroSuperior);
  pintar(r.bin, r.box, r.w, r.h);
  numero(3, 1990, 2120);
}

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

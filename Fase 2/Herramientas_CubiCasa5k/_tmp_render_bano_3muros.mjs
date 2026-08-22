import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const mu13 = [seg([2263,2036],[2263,2129]), seg([2297,2002],[2297,2129]), seg([2203,2036],[2263,2036]),
              seg([2203,2002],[2297,2002]), seg([2297,2129],[2263,2129]), seg([2203,2002],[2203,2036]),
              seg([2203,2036],[2203,2129]), seg([2203,2129],[2263,2129])];
const muroLateral = [seg([2280,2129],[2297,2129]), seg([2297,2129],[2297,2393]), seg([2297,2393],[2280,2393]), seg([2280,2393],[2280,2129])];
const muroSuperior = [seg([2203,2112],[2203,2129]), seg([2203,2129],[1787,2129]), seg([1787,2129],[1787,2112]), seg([1787,2112],[2203,2112])];
const muroIzq = [seg([1770,2223],[1787,2223]), seg([1787,2223],[1787,2376]), seg([1787,2376],[1770,2376]), seg([1770,2376],[1770,2223])];
const mu05 = [seg([1736,2223],[1786,2223])];
const mu12 = [seg([1736,2376],[1786,2376]), seg([1786,2393],[1829,2393]), seg([1786,2376],[1786,2393])];
const contexto = [...mu13, ...muroLateral, ...muroSuperior, ...muroIzq, ...mu05, ...mu12];

const relleno = rellenoSolidoDeContexto(contexto, mpx);
const { box, w, h, bin } = relleno;
const canvas = createCanvas(w, h);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, box.x0, box.y0, w, h, 0, 0, w, h);
const overlay = ctx.getImageData(0, 0, w, h);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (bin[y * w + x]) {
    const idx = (y * w + x) * 4;
    overlay.data[idx] = Math.round(overlay.data[idx] * 0.3 + 46 * 0.7);
    overlay.data[idx + 1] = Math.round(overlay.data[idx + 1] * 0.3 + 204 * 0.7);
    overlay.data[idx + 2] = Math.round(overlay.data[idx + 2] * 0.3 + 64 * 0.7);
  }
}
ctx.putImageData(overlay, 0, 0);
ctx.font = "bold 16px sans-serif"; ctx.fillStyle = "black";
ctx.fillText("Bano Universal: los 3 muros rojos (incluido el izquierdo que faltaba)", 8, 20);
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

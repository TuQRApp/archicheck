import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const grupoA = [seg([1880,2394],[2195,2394]), seg([1880,2445],[2144,2445]), seg([2144,2530],[2195,2530]),
                seg([2144,2445],[2144,2530]), seg([2195,2530],[2195,2394])];
const grupoB = [seg([2195,2394],[2195,2324]), seg([2161,2394],[2161,2324]), seg([2382,2394],[2195,2394]),
                seg([2382,2411],[2195,2411]), seg([2195,2411],[2195,2394])];
const contexto = [...grupoA, ...grupoB, seg([2382,1612],[2382,2394])];

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
ctx.fillText("Cruce de 5 vias (MU13, N2) -- relleno real, fusiona=true", 8, 20);
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const grupoA = [seg([2263,2036],[2263,2129]), seg([2297,2002],[2297,2129]), seg([2203,2036],[2263,2036]),
                seg([2203,2002],[2297,2002]), seg([2297,2129],[2263,2129])];
const grupoB = [seg([2280,2129],[2297,2129]), seg([2297,2129],[2297,2393]), seg([2297,2393],[2280,2393]),
                seg([2280,2393],[2280,2129])];
const contexto = [...grupoA, ...grupoB];

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
ctx.font = "bold 18px sans-serif"; ctx.fillStyle = "black";
ctx.fillText("Bano Universal: MU13 + rectangulo real (op#2367, hoy excluido por ser 're')", 8, 22);
ctx.fillText("cuerpo cerrado: fusiona=true -- recupera el muro sin tocar capa ni leyenda", 8, 44);
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

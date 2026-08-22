import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);
const data = JSON.parse(fs.readFileSync("_tmp_relleno_e07.json", "utf8"));
const { box, w, h, bin } = data;

const canvas = createCanvas(w, h);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.drawImage(img, box.x0, box.y0, w, h, 0, 0, w, h);

const overlay = ctx.getImageData(0, 0, w, h);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    if (bin[y * w + x]) {
      const idx = (y * w + x) * 4;
      overlay.data[idx] = Math.round(overlay.data[idx] * 0.3 + 46 * 0.7);
      overlay.data[idx + 1] = Math.round(overlay.data[idx + 1] * 0.3 + 204 * 0.7);
      overlay.data[idx + 2] = Math.round(overlay.data[idx + 2] * 0.3 + 64 * 0.7);
    }
  }
}
ctx.putImageData(overlay, 0, 0);

ctx.font = "bold 20px sans-serif";
ctx.fillStyle = "black";
ctx.fillText("Relleno real: 1 solo muro, seccion mas ancha en el medio (E07), sin separar", 8, 26);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const grupoA = [seg([817,2572],[817,2445])];
const grupoB = [seg([613,2572],[817,2572]), seg([834,2590],[613,2590]), seg([834,2572],[834,2590])];
const contexto = [...grupoA, ...grupoB, seg([834,2445],[834,2572])];

const relleno = rellenoSolidoDeContexto(contexto, mpx);
const { box, w, h, bin } = relleno;

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

const [dx, dy] = [817 - box.x0, 2572 - box.y0];
ctx.beginPath(); ctx.arc(dx, dy, 8, 0, Math.PI * 2);
ctx.strokeStyle = "#ff4136"; ctx.lineWidth = 3; ctx.stroke();

ctx.font = "bold 16px sans-serif";
ctx.fillStyle = "black";
ctx.fillText("Cuerpo cerrado puro FUSIONA (mal) -- PG04 (1 punto union) toca sin gap real", 8, 20);
ctx.fillText("Necesita el override explicito de puerta para bloquear, la geometria sola no alcanza aqui", 8, 40);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

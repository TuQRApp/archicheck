import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { cuerpoCerradoFusiona, rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const out = process.argv[3];
const img = await loadImage(src);

const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

const grupoA = [seg([1001,505],[1001,369]), seg([1043,505],[1001,505]), seg([1043,369],[1043,505])];
const grupoB = [seg([1001,811],[1001,760]), seg([1043,760],[1001,760]), seg([1043,811],[1001,811]),
                 seg([1043,811],[1043,803]), seg([1043,803],[1166,803]), seg([1043,760],[1166,760])];
const contexto = [...grupoA, ...grupoB, seg([715,369],[715,1083]), seg([1310,369],[1043,369])];

const r = cuerpoCerradoFusiona(grupoA, grupoB, contexto, mpx);
console.log("fusiona:", r.fusiona, r.motivo);

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

// marca el hueco real de la puerta (arco de PG01)
ctx.strokeStyle = "#ff4136"; ctx.lineWidth = 4; ctx.setLineDash([8, 5]);
const [ax, ay] = [1001 - box.x0, 505 - box.y0];
const [bx, by] = [1001 - box.x0, 760 - box.y0];
ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
ctx.setLineDash([]);

ctx.font = "bold 18px sans-serif";
ctx.fillStyle = "black";
ctx.fillText(`Relleno real: MU23 y MU24, puerta real (PG01) entre medio -- fusiona=${r.fusiona}`, 8, 24);

fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log("saved", out);

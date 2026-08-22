import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const src = process.argv[2];
const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;

async function render(contexto, out, label) {
  const img = await loadImage(src);
  const relleno = rellenoSolidoDeContexto(contexto, mpx, 0.4);
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
  ctx.fillText(label, 8, 20);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("saved", out);
}

const mu03 = [seg([562,2241],[562,2530]),seg([613,2241],[562,2241]),seg([562,2530],[613,2530]),
              seg([613,2275],[613,2530]),seg([613,1612],[613,2241]),seg([613,2241],[596,2241]),
              seg([596,2241],[596,1612]),seg([613,2275],[613,2241])];
const mu26 = [seg([817,1612],[613,1612]),seg([596,1594],[817,1594]),seg([817,1594],[817,1612]),seg([596,1612],[596,1594])];
await render([...mu03, ...mu26], process.argv[3], "Muro2 = MU03 + MU26 (L), confirmado por cuerpo cerrado");

const derecha = [seg([817,2572],[817,2445]), seg([834,2445],[834,2572])];
const mu29 = [seg([613,2572],[817,2572]),seg([834,2590],[613,2590]),seg([613,2590],[613,2572]),seg([834,2572],[834,2590])];
await render([...derecha, ...mu29], process.argv[4], "Muro5 = MU17+MU19+MU29 (L), confirmado por cuerpo cerrado");

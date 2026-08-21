import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

function esAmarillo(r, g, b) {
  return r > 180 && g > 180 && b < 120 && (r - b) > 60 && (g - b) > 60;
}
function esLila(r, g, b) {
  return r > 180 && b > 150 && g < 160 && (r - g) > 60 && (b - g) > 30;
}

async function detectarBlobs(srcPath) {
  const img = await loadImage(srcPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  function tipoPixel(i) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (esAmarillo(r, g, b)) return "AMARILLO";
    if (esLila(r, g, b)) return "LILA";
    return null;
  }
  const visitado = new Uint8Array(width * height);
  const blobs = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visitado[idx]) continue;
      const i = idx * 4;
      const tipo = tipoPixel(i);
      if (!tipo) { visitado[idx] = 1; continue; }
      const stack = [[x, y]];
      visitado[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        // radio de conexion 3px -- une blobs separados por una linea negra fina que los cruza
        for (let ddx = -3; ddx <= 3; ddx++) {
          for (let ddy = -3; ddy <= 3; ddy++) {
            if (ddx === 0 && ddy === 0) continue;
            const nx = cx + ddx, ny = cy + ddy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nidx = ny * width + nx;
            if (visitado[nidx]) continue;
            const ni = nidx * 4;
            if (tipoPixel(ni) === tipo) {
              visitado[nidx] = 1;
              stack.push([nx, ny]);
            }
          }
        }
      }
      if (n >= 15) blobs.push({ tipo, minX, maxX, minY, maxY, n, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 });
    }
  }
  return { img, canvas, ctx, blobs };
}

let contadorEX = 0, contadorIN = 0;
const resumen = [];

for (let idx = 1; idx <= 6; idx++) {
  const srcPath = `C:/Users/nicolas.estragues/Downloads/Cap${idx}.jpg`;
  const outPath = process.argv[2].replace("__IDX__", idx);
  const { canvas, ctx, blobs } = await detectarBlobs(srcPath);
  const amarillos = blobs.filter(b => b.tipo === "AMARILLO").sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const lilas = blobs.filter(b => b.tipo === "LILA").sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  ctx.font = "bold 22px sans-serif";
  amarillos.forEach(b => {
    contadorEX++;
    const label = `EX${contadorEX}`;
    ctx.fillStyle = "#000000";
    ctx.fillRect(b.cx - 2, b.minY - 26, ctx.measureText(label).width + 8, 24);
    ctx.fillStyle = "#ffff00";
    ctx.fillText(label, b.cx + 2, b.minY - 8);
    resumen.push({ label, cap: idx, cx: Math.round(b.cx), cy: Math.round(b.cy), n_px: b.n });
  });
  lilas.forEach(b => {
    contadorIN++;
    const label = `IN${contadorIN}`;
    ctx.fillStyle = "#000000";
    ctx.fillRect(b.cx - 2, b.maxY + 2, ctx.measureText(label).width + 8, 24);
    ctx.fillStyle = "#ff66ff";
    ctx.fillText(label, b.cx + 2, b.maxY + 20);
    resumen.push({ label, cap: idx, cx: Math.round(b.cx), cy: Math.round(b.cy), n_px: b.n });
  });

  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
}

console.log(JSON.stringify(resumen, null, 2));
console.log(`\nTotal: ${contadorEX} EX, ${contadorIN} IN`);

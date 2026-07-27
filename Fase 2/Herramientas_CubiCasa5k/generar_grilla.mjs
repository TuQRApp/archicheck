import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const imgPath = process.argv[2];
const outPath = process.argv[3];

const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

ctx.strokeStyle = "rgba(255,0,255,0.5)";
ctx.fillStyle = "rgba(255,0,255,0.9)";
ctx.lineWidth = 2;
ctx.font = "bold 26px sans-serif";

// Lineas verticales cada 0.05 (5%), etiquetas cada 0.1
for (let f = 0; f <= 1.0; f += 0.05) {
  const x = f * img.width;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, img.height);
  ctx.stroke();
  if (Math.round(f * 100) % 10 === 0) {
    ctx.fillText(f.toFixed(2), x + 4, 30);
  }
}
// Lineas horizontales cada 0.05, etiquetas cada 0.1
for (let f = 0; f <= 1.0; f += 0.05) {
  const y = f * img.height;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(img.width, y);
  ctx.stroke();
  if (Math.round(f * 100) % 10 === 0) {
    ctx.fillText(f.toFixed(2), 4, y - 6);
  }
}

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Guardado: ${outPath} (${img.width}x${img.height})`);

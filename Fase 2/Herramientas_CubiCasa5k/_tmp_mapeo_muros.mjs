import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const [,, jsonPath, imgPath, pageIdx, outPath, label] = process.argv;
const j = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const pagina = j.paginas[Number(pageIdx)];
const muros = pagina.muros_geo;
const puertas = pagina.puertas_geo || [];

const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

const colores = ["#e6194b","#3cb44b","#4363d8","#f58231","#911eb4","#42d4f4","#f032e6","#bfef45","#fabed4","#469990","#dcbeff","#9A6324","#800000","#aaffc3","#000075"];

muros.forEach((m, i) => {
  const col = colores[i % colores.length];
  ctx.strokeStyle = col;
  ctx.lineWidth = 6;
  let cx = 0, cy = 0, n = 0;
  for (const s of m.segmentos) {
    ctx.beginPath();
    ctx.moveTo(s.p1[0], s.p1[1]);
    ctx.lineTo(s.p2[0], s.p2[1]);
    ctx.stroke();
    cx += (s.p1[0] + s.p2[0]) / 2;
    cy += (s.p1[1] + s.p2[1]) / 2;
    n++;
  }
  cx /= n; cy /= n;
  const numLabel = String(i + 1);
  ctx.font = "bold 34px sans-serif";
  ctx.fillStyle = "white";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "black";
  ctx.strokeText(numLabel, cx - 10, cy + 10);
  ctx.fillText(numLabel, cx - 10, cy + 10);
});

// doors in a distinct color (cyan-ish outline circle at each union point)
ctx.strokeStyle = "#00ffff";
ctx.lineWidth = 4;
puertas.forEach((p) => {
  const pts = p.puntos_union || [];
  for (const pt of pts) {
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], 14, 0, Math.PI * 2);
    ctx.stroke();
  }
});

ctx.font = "bold 40px sans-serif";
ctx.fillStyle = "black";
ctx.fillText(`${label} — ${muros.length} muros`, 30, 60);

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("saved", outPath, "muros:", muros.length);

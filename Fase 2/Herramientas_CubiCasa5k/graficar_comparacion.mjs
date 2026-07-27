import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const GT_N1_PUERTAS = [
  ["GT01", 0.28, 0.19], ["GT02", 0.43, 0.22], ["GT03", 0.34, 0.24], ["GT04", 0.65, 0.20],
  ["GT05", 0.17, 0.45], ["GT06", 0.25, 0.485], ["GT07", 0.35, 0.62], ["GT08", 0.29, 0.685],
  ["GT09", 0.47, 0.735], ["GT10", 0.65, 0.735], ["GT11", 0.82, 0.755], ["GT12", 0.62, 0.905],
  ["GT13", 0.64, 0.995], ["GT14", 0.46, 1.03], ["GT15", 0.55, 1.06], ["GT16", 0.51, 1.39],
];

const cubi = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));
const cubiN1 = cubi.find(r => r.archivo.includes("pag2-1"));

const imgPath = "archicheck/Fase 2/Desarrollos/archicheck_geometrico_remodelacion_pdv_23jul_0618_pag2-1.png";

const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

ctx.font = "bold 34px sans-serif";
ctx.lineWidth = 4;

// Ground truth: verde
ctx.strokeStyle = "#00AA00";
ctx.fillStyle = "#00AA00";
for (const [id, cx, cy] of GT_N1_PUERTAS) {
  const x = cx * img.width;
  const y = cy * img.height; // OJO: si cy > 1, esto cae FUERA del canvas -- se vera claramente
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillText(id, x + 26, y);
}

// CubiCasa5K: rojo
ctx.strokeStyle = "#FF0000";
ctx.fillStyle = "#FF0000";
cubiN1.puertas.forEach((p, i) => {
  const x = p.cx_rel * img.width;
  const y = p.cy_rel * img.height;
  ctx.beginPath();
  ctx.rect(x - 22, y - 22, 44, 44);
  ctx.stroke();
  ctx.fillText(`C${i + 1}`, x - 22, y - 30);
});

const out = "archicheck/Fase 2/Herramientas_CubiCasa5k/comparacion_puertas_n1.png";
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`Guardado: ${out}`);
console.log(`Dimension imagen: ${img.width}x${img.height}`);
console.log("Verde = ground truth (GT), Rojo = CubiCasa5K (C)");

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const jsonPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const dir = jsonPath.substring(0, jsonPath.lastIndexOf("/"));
const base = jsonPath.substring(jsonPath.lastIndexOf("/") + 1).replace(".json", "");

for (const pagina of data.paginas) {
  const imgPath = `${dir}/${base}_${pagina.fname_tag}.png`;
  if (!fs.existsSync(imgPath)) { console.log(`No existe: ${imgPath}`); continue; }
  const img = await loadImage(imgPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const dv = pagina.datos_vectoriales;

  // trazos cortos borrados (simbolos/artefactos) -- rojo
  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  (dv.trazos || []).forEach(tr => {
    const pts = tr.puntos;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  // lineas discontinuas borradas -- azul, mas grueso para que se note
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 5;
  (dv.lineas_discontinuas || []).forEach(ld => {
    const pts = ld.puntos;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = "white";
  ctx.fillRect(10, 10, 700, 80);
  ctx.fillStyle = "red";
  ctx.fillText(`● trazos borrados (símbolo/artefacto): ${dv.trazos.length}`, 20, 45);
  ctx.fillStyle = "blue";
  ctx.fillText(`● líneas discontinuas borradas: ${dv.lineas_discontinuas.length}`, 20, 80);

  const outPath = `archicheck/Fase 2/Herramientas_CubiCasa5k/verif_trazos_borrados_${pagina.fname_tag}.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath}`);
}

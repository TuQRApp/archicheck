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

  ctx.strokeStyle = "red";
  ctx.lineWidth = 3;
  (dv.trazos || []).forEach(tr => {
    const pts = tr.puntos;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  ctx.strokeStyle = "blue";
  ctx.lineWidth = 5;
  (dv.lineas_discontinuas || []).forEach(ld => {
    const pts = ld.puntos;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });

  // encontrar el recinto mas grande (el sospechoso) y marcar SOLO su bbox,
  // bien grueso, en negro, para verlo cruzado con lo que se borro
  const masGrande = [...pagina.mediciones_geometricas].sort((a, b) => b.area_m2 - a.area_m2)[0];
  if (masGrande && masGrande.bbox) {
    const { x, y, w, h } = masGrande.bbox;
    ctx.strokeStyle = "black";
    ctx.lineWidth = 8;
    ctx.strokeRect(x, y, w, h);
    ctx.font = "bold 34px sans-serif";
    ctx.fillStyle = "black";
    ctx.fillText(`${masGrande.id} ${masGrande.nombre} — ${masGrande.area_m2}m2`, x + 10, y + 40);
  }

  const outPath = `archicheck/Fase 2/Herramientas_CubiCasa5k/verif_combinado_${pagina.fname_tag}.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath}`);
}

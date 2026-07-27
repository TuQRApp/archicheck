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

  pagina.mediciones_geometricas.forEach(r => {
    if (!r.bbox) return;
    const { x, y, w, h } = r.bbox;
    const color = r.sin_nombre_confirmar ? "red" : "lime";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    const label = `${r.id} ${r.nombre.replace(" (SIN NOMBRE - confirmar con arquitecto)", " [SIN NOMBRE]")} - ${r.area_m2}m2`;
    ctx.font = "bold 20px sans-serif";
    const anchoTexto = ctx.measureText(label).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, Math.max(0, y - 24), anchoTexto + 8, 24);
    ctx.fillStyle = "black";
    ctx.fillText(label, x + 4, Math.max(16, y - 6));
  });

  const outPath = `archicheck/Fase 2/Herramientas_CubiCasa5k/verif_recintos_${pagina.fname_tag}.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath} (${pagina.mediciones_geometricas.length} recintos, verde=con nombre, rojo=sin nombre)`);
}

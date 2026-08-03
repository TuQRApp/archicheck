import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const jsonPath = process.argv[2];
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const dir = jsonPath.substring(0, jsonPath.lastIndexOf("/"));
const base = jsonPath.substring(jsonPath.lastIndexOf("/") + 1).replace(".json", "");

const COLORES = ["#ff0000", "#00aaff", "#00ff00", "#ff00ff", "#ffaa00", "#00ffff", "#ff66aa", "#aaff00", "#8800ff", "#ff8800", "#0044ff"];

for (const pagina of data.paginas) {
  const imgPath = `${dir}/${base}_${pagina.fname_tag}.png`;
  if (!fs.existsSync(imgPath)) { console.log(`No existe: ${imgPath}`); continue; }
  const img = await loadImage(imgPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  (pagina.muros_geo || []).forEach((m, idx) => {
    const color = COLORES[idx % COLORES.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    m.segmentos.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s.p1[0], s.p1[1]);
      ctx.lineTo(s.p2[0], s.p2[1]);
      ctx.stroke();
    });
    const p0 = m.segmentos[0].p1;
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = color;
    ctx.fillRect(p0[0], Math.max(0, p0[1] - 28), 90, 28);
    ctx.fillStyle = "black";
    ctx.fillText(m.id, p0[0] + 4, Math.max(20, p0[1] - 6));
  });

  // Puertas (puertas_geo, clasificador geometrico): siempre en negro grueso para
  // que resalten sobre los muros de colores, + circulos en los puntos de union.
  (pagina.puertas_geo || []).forEach(p => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 6;
    p.segmentos.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s.p1[0], s.p1[1]);
      ctx.lineTo(s.p2[0], s.p2[1]);
      ctx.stroke();
    });
    (p.puntos_union || []).forEach(pu => {
      ctx.beginPath();
      ctx.arc(pu[0], pu[1], 10, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff00";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const p0 = p.segmentos[0].p1;
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "#000000";
    ctx.fillRect(p0[0], Math.max(0, p0[1] - 28), 130, 28);
    ctx.fillStyle = "white";
    ctx.fillText(`${p.id} ${p.ancho_estimado_m}m`, p0[0] + 4, Math.max(20, p0[1] - 6));
  });

  const outPath = `${dir}/verif_muros_${pagina.fname_tag}.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath} (${(pagina.muros_geo || []).length} muros, ${(pagina.puertas_geo || []).length} puertas)`);
}

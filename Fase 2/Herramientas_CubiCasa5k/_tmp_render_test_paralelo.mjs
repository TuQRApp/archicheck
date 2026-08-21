import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const jsonPath = process.argv[2];
const fnameTag = process.argv[3];
const resultadoPath = process.argv[4];
const outPath = process.argv[5];

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const dir = jsonPath.substring(0, jsonPath.lastIndexOf("/"));
const base = jsonPath.substring(jsonPath.lastIndexOf("/") + 1).replace(".json", "");
const pagina = data.paginas.find(p => p.fname_tag === fnameTag);
const resultado = JSON.parse(fs.readFileSync(resultadoPath, "utf8"));
const veredictoPorId = {};
resultado.forEach(r => { veredictoPorId[r.id] = r; });

const imgPath = `${dir}/${base}_${fnameTag}.png`;
const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

(pagina.muros_geo || []).forEach(m => {
  const r = veredictoPorId[m.id];
  let color = "#00aa00"; // verde = pasa (tiene paralelo)
  if (r && r.n_segmentos_largos === 0) color = "#999999"; // gris = solo mullion/esquina, sin evaluar
  else if (r && !r.tiene_algun_paralelo) color = "#ff0000"; // rojo = rechazado (linea sola)

  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  m.segmentos.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.p1[0], s.p1[1]);
    ctx.lineTo(s.p2[0], s.p2[1]);
    ctx.stroke();
  });
  if (color === "#ff0000") {
    const p0 = m.segmentos[0].p1;
    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(p0[0], Math.max(0, p0[1] - 28), 90, 28);
    ctx.fillStyle = "white";
    ctx.fillText(m.id, p0[0] + 4, Math.max(20, p0[1] - 6));
  }
});

// Leyenda
ctx.font = "bold 24px sans-serif";
ctx.fillStyle = "#00aa00"; ctx.fillText("VERDE = tiene par paralelo (muro real)", 20, canvas.height - 90);
ctx.fillStyle = "#ff0000"; ctx.fillText("ROJO = sin par paralelo (rechazado, linea sola)", 20, canvas.height - 60);
ctx.fillStyle = "#999999"; ctx.fillText("GRIS = solo mullion/esquina corta (sin evaluar)", 20, canvas.height - 30);

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("Guardado:", outPath);

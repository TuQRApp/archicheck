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
const detallePorId = {};
resultado.forEach(r => { detallePorId[r.id] = r; });

const imgPath = `${dir}/${base}_${fnameTag}.png`;
const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

function mismoPunto(a, b) { return Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5; }

// Colorea CADA SEGMENTO por su propio veredicto (no toda la entrada junta) --
// una entrada puede ser una mezcla real de muro (segmentos con par) +
// ventana (segmento sin par) fusionados en el mismo id.
let n_segmentos_rechazados = 0;
(pagina.muros_geo || []).forEach(m => {
  const r = detallePorId[m.id];
  m.segmentos.forEach(s => {
    const largoPx = Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]);
    let color = "#999999"; // gris = corto, no evaluado (mullion/esquina)
    if (r) {
      const d = r.detalle.find(dd => mismoPunto(dd.p1, s.p1) && mismoPunto(dd.p2, s.p2));
      if (d) {
        color = d.tiene_paralelo ? "#00aa00" : "#ff0000";
        if (!d.tiene_paralelo) n_segmentos_rechazados++;
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(s.p1[0], s.p1[1]);
    ctx.lineTo(s.p2[0], s.p2[1]);
    ctx.stroke();
    if (color === "#ff0000") {
      const mx = (s.p1[0] + s.p2[0]) / 2, my = (s.p1[1] + s.p2[1]) / 2;
      ctx.font = "bold 22px sans-serif";
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(mx, my - 26, ctx.measureText(m.id).width + 10, 24);
      ctx.fillStyle = "white";
      ctx.fillText(m.id, mx + 4, my - 8);
    }
  });
});

ctx.font = "bold 24px sans-serif";
ctx.fillStyle = "#00aa00"; ctx.fillText("VERDE = segmento con par paralelo (muro real)", 20, canvas.height - 90);
ctx.fillStyle = "#ff0000"; ctx.fillText("ROJO = segmento sin par paralelo (ventana/pavimento/texto)", 20, canvas.height - 60);
ctx.fillStyle = "#999999"; ctx.fillText("GRIS = segmento corto, no evaluado (mullion/pilar/esquina)", 20, canvas.height - 30);

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("Guardado:", outPath, "-", n_segmentos_rechazados, "segmentos individuales rechazados");

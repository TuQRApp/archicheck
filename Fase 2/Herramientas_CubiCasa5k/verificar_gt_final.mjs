import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

function parseGT(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n");
  return lines.filter(l => l.startsWith("GT-")).map(line => {
    const campos = [];
    let cur = "", enComillas = false;
    for (const c of line) {
      if (c === '"') { enComillas = !enComillas; continue; }
      if (c === "," && !enComillas) { campos.push(cur); cur = ""; continue; }
      cur += c;
    }
    campos.push(cur);
    const [id, tipo, cx_rel, cy_rel] = campos;
    return { id, tipo, cx_rel: +cx_rel, cy_rel: +cy_rel };
  });
}

const COLOR = { puerta: "orange", ventana: "green", escalera: "purple", rampa: "deeppink", muro: "blue" };

async function verificar(imgPath, gtPath, outPath) {
  const gt = parseGT(gtPath);
  const img = await loadImage(imgPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  gt.forEach(g => {
    const x = g.cx_rel * img.width, y = g.cy_rel * img.height;
    ctx.fillStyle = COLOR[g.tipo] || "black";
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath} (${gt.length} puntos, imagen ${img.width}x${img.height})`);
}

await verificar(
  "archicheck/Fase 2/Desarrollos/Test/plano_nivel1_marcado_v12.png",
  "archicheck/Startup Chile/ground_truth_pdv_nivel1_final.csv",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/verif_gt_final_n1.png"
);
await verificar(
  "archicheck/Fase 2/Desarrollos/Test/plano_nivel2_marcado_v12.png",
  "archicheck/Startup Chile/ground_truth_pdv_nivel2_final.csv",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/verif_gt_final_n2.png"
);

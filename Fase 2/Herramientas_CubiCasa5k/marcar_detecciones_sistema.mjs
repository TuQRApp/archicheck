// Marca sobre el PNG original (el que usa el pipeline, no el rotulado a mano)
// las posiciones que el SISTEMA detecto -- por ahora solo CubiCasa5K tiene
// datos de posicion reales (DINO devolvio array vacio en esta corrida,
// Claude Vision solo entrega conteos, no posiciones por elemento).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const cubi = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));

const niveles = [
  { tag: "pag2-1", nombre: "Nivel1", img: "archicheck/Fase 2/Desarrollos/archicheck_geometrico_remodelacion_pdv_23jul_0618_pag2-1.png" },
  { tag: "pag2-2", nombre: "Nivel2", img: "archicheck/Fase 2/Desarrollos/archicheck_geometrico_remodelacion_pdv_23jul_0618_pag2-2.png" },
];

for (const nivel of niveles) {
  const registro = cubi.find(r => r.archivo.includes(nivel.tag));
  const img = await loadImage(nivel.img);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  function marca(p, i, color, etiqueta) {
    const x = p.cx_rel * img.width;
    const y = p.cy_rel * img.height;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 22, y); ctx.lineTo(x + 22, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y + 22);
    ctx.stroke();

    ctx.font = "bold 20px sans-serif";
    const texto = `${etiqueta}${i + 1}`;
    const anchoTexto = ctx.measureText(texto).width;
    ctx.fillStyle = "white";
    ctx.fillRect(x + 18, y - 22, anchoTexto + 8, 24);
    ctx.fillStyle = color;
    ctx.fillText(texto, x + 22, y - 4);
  }

  registro.puertas.forEach((p, i) => marca(p, i, "red", "PU"));
  registro.ventanas.forEach((p, i) => marca(p, i, "blue", "VE"));

  // leyenda
  ctx.font = "bold 30px sans-serif";
  ctx.fillStyle = "white";
  ctx.fillRect(10, 10, 520, 90);
  ctx.fillStyle = "red";
  ctx.fillText(`● Puertas CubiCasa5K (thr 0.3): ${registro.puertas.length}`, 20, 45);
  ctx.fillStyle = "blue";
  ctx.fillText(`● Ventanas CubiCasa5K (thr 0.3): ${registro.ventanas.length}`, 20, 85);

  const outPath = `archicheck/Fase 2/Herramientas_CubiCasa5k/deteccion_sistema_${nivel.nombre}.png`;
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  console.log(`Guardado: ${outPath} (${registro.puertas.length} puertas, ${registro.ventanas.length} ventanas)`);
}

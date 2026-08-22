import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
import { rellenoSolidoDeContexto } from "./_tmp_cuerpo_cerrado.mjs";

const seg = (p1, p2) => ({ p1, p2 });
const mpx = 0.00588;
// muro sintetico en forma de "+": 4 brazos de 0.3m de ancho (51px), cada uno
// con sus 2 caras, saliendo de un centro comun en (500,500)
const centro = 500, mitadAncho = 25, largo = 200;
const contexto = [
  // brazo norte (2 caras verticales)
  seg([centro - mitadAncho, centro - largo], [centro - mitadAncho, centro]),
  seg([centro + mitadAncho, centro - largo], [centro + mitadAncho, centro]),
  // brazo sur
  seg([centro - mitadAncho, centro], [centro - mitadAncho, centro + largo]),
  seg([centro + mitadAncho, centro], [centro + mitadAncho, centro + largo]),
  // brazo oeste (2 caras horizontales)
  seg([centro - largo, centro - mitadAncho], [centro, centro - mitadAncho]),
  seg([centro - largo, centro + mitadAncho], [centro, centro + mitadAncho]),
  // brazo este
  seg([centro, centro - mitadAncho], [centro + largo, centro - mitadAncho]),
  seg([centro, centro + mitadAncho], [centro + largo, centro + mitadAncho]),
];

const r = rellenoSolidoDeContexto(contexto, mpx, 0.1);
const { box, w, h, bin } = r;
const canvas = createCanvas(w, h);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "white"; ctx.fillRect(0, 0, w, h);
ctx.fillStyle = "#ff851b";
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (bin[y * w + x]) ctx.fillRect(x, y, 1, 1);
}
fs.writeFileSync(process.argv[2], canvas.toBuffer("image/png"));
console.log("saved", process.argv[2]);

// chequeo puntual de las 4 esquinas interiores de la cruz
function check(px, py) {
  const x = Math.round(px - box.x0), y = Math.round(py - box.y0);
  return bin[y * w + x];
}
console.log("esquina interior NO (475,475):", check(centro - mitadAncho, centro - mitadAncho));
console.log("esquina interior NE (525,475):", check(centro + mitadAncho, centro - mitadAncho));
console.log("esquina interior SO (475,525):", check(centro - mitadAncho, centro + mitadAncho));
console.log("esquina interior SE (525,525):", check(centro + mitadAncho, centro + mitadAncho));

// Detecta clusters de pixeles rojos (las etiquetas PU/VE/ES/RA que el usuario
// dibujo sobre el plano) y devuelve su posicion real, en vez de que Claude
// estime fracciones a ojo. Filtra por tono de rojo especifico para no
// confundir con el achurado rojo de "Se construye" (que es mas rosado/opaco)
// ni con las lineas rojas de cota existentes en el plano.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const imgPath = process.argv[2];
const outJson = process.argv[3];

const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, img.width, img.height);

// Rojo "puro" de las etiquetas de texto (tipo #FF0000 / #E00000), no el rosa
// del achurado "Se construye" ni el rojo mas oscuro de cotas existentes.
function esRojoEtiqueta(r, g, b) {
  return r > 200 && g < 60 && b < 60;
}

const w = img.width, h = img.height;
const visitado = new Uint8Array(w * h);
const STEP = 2; // muestrear cada 2px para velocidad, suficiente para texto

function idx(x, y) { return y * w + x; }

const clusters = [];
for (let y = 0; y < h; y += STEP) {
  for (let x = 0; x < w; x += STEP) {
    if (visitado[idx(x, y)]) continue;
    const p = (y * w + x) * 4;
    const [r, g, b] = [data[p], data[p + 1], data[p + 2]];
    if (!esRojoEtiqueta(r, g, b)) continue;

    // BFS/flood-fill simple sobre la grilla muestreada
    const pila = [[x, y]];
    const puntos = [];
    visitado[idx(x, y)] = 1;
    while (pila.length) {
      const [cx, cy] = pila.pop();
      puntos.push([cx, cy]);
      for (const [dx, dy] of [[STEP,0],[-STEP,0],[0,STEP],[0,-STEP],[STEP,STEP],[-STEP,-STEP],[STEP,-STEP],[-STEP,STEP]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (visitado[idx(nx, ny)]) continue;
        const np = (ny * w + nx) * 4;
        if (esRojoEtiqueta(data[np], data[np + 1], data[np + 2])) {
          visitado[idx(nx, ny)] = 1;
          pila.push([nx, ny]);
        }
      }
    }
    if (puntos.length >= 5) { // descartar ruido de 1-2 pixeles sueltos
      clusters.push(puntos);
    }
  }
}

// Fusionar clusters cercanos (letras de una misma palabra "PU" quedan como
// 2 clusters -- la P y la U -- si no estan pegadas)
function bbox(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), n: pts.length };
}
let cajas = clusters.map(bbox);

function seSuperponenORCercanas(a, b, margen = 30) {
  return !(a.x1 + margen < b.x0 || b.x1 + margen < a.x0 || a.y1 + margen < b.y0 || b.y1 + margen < a.y0);
}
let cambiado = true;
while (cambiado) {
  cambiado = false;
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      if (seSuperponenORCercanas(cajas[i], cajas[j])) {
        cajas[i] = {
          x0: Math.min(cajas[i].x0, cajas[j].x0), x1: Math.max(cajas[i].x1, cajas[j].x1),
          y0: Math.min(cajas[i].y0, cajas[j].y0), y1: Math.max(cajas[i].y1, cajas[j].y1),
          n: cajas[i].n + cajas[j].n,
        };
        cajas.splice(j, 1);
        cambiado = true;
        break;
      }
    }
    if (cambiado) break;
  }
}

// Descartar cajas demasiado grandes (probable achurado/nota de texto larga, no una etiqueta corta)
const ANCHO_MAX_ETIQUETA = 220; // px -- una etiqueta "PU"/"VE"/"ES"/"RA" es corta
cajas = cajas.filter(c => (c.x1 - c.x0) < ANCHO_MAX_ETIQUETA && (c.y1 - c.y0) < 90);

const resultado = cajas.map(c => ({
  cx_px: Math.round((c.x0 + c.x1) / 2),
  cy_px: Math.round((c.y0 + c.y1) / 2),
  cx_rel: +(((c.x0 + c.x1) / 2) / w).toFixed(4),
  cy_rel: +(((c.y0 + c.y1) / 2) / h).toFixed(4),
  ancho_px: c.x1 - c.x0,
  alto_px: c.y1 - c.y0,
}));

resultado.sort((a, b) => a.cy_rel - b.cy_rel || a.cx_rel - b.cx_rel);

console.log(`Imagen: ${w}x${h}`);
console.log(`Clusters de etiqueta roja detectados: ${resultado.length}`);
resultado.forEach((r, i) => console.log(`  ${i + 1}: cx_rel=${r.cx_rel} cy_rel=${r.cy_rel} (${r.ancho_px}x${r.alto_px}px)`));

fs.writeFileSync(outJson, JSON.stringify(resultado, null, 2));
console.log(`\nGuardado: ${outJson}`);

import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

// Uso: node _tmp_render_conteo_muros.mjs <json> <fname_tag> <out.png>
// Mismo patron ya usado para Beauchef/PdV: renumeracion espacial (banda de
// altura ~250px, izquierda->derecha dentro de cada banda), etiqueta anclada
// al punto medio del segmento MAS LARGO de cada muro (nunca un extremo --
// bug ya documentado, dos muros que casi se tocan en un cruce pueden
// solapar su etiqueta si se ancla en el extremo), + pasada anti-colision
// que separa cualquier par de etiquetas a menos de 45px.

const [, , jsonPath, fnameTag, outPath] = process.argv;
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const dir = jsonPath.substring(0, jsonPath.lastIndexOf("/"));
const base = jsonPath.substring(jsonPath.lastIndexOf("/") + 1).replace(".json", "");
const pagina = data.paginas.find(p => p.fname_tag === fnameTag);
if (!pagina) { console.error("No se encontro fname_tag", fnameTag); process.exit(1); }

const imgPath = `${dir}/${base}_${fnameTag}.png`;
const img = await loadImage(imgPath);
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

const muros = pagina.muros_geo || [];

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function segMasLargo(m) {
  let mejor = m.segmentos[0], mejorLen = -1;
  for (const s of m.segmentos) {
    const l = dist(s.p1, s.p2);
    if (l > mejorLen) { mejorLen = l; mejor = s; }
  }
  return mejor;
}
function puntoMedio(s) { return [(s.p1[0] + s.p2[0]) / 2, (s.p1[1] + s.p2[1]) / 2]; }
function centroide(m) {
  let sx = 0, sy = 0, n = 0;
  for (const s of m.segmentos) { sx += s.p1[0] + s.p2[0]; sy += s.p1[1] + s.p2[1]; n += 2; }
  return [sx / n, sy / n];
}

// Renumeracion espacial: banda de altura ~250px, izq->der dentro de cada banda
const BANDA_PX = 250;
const conCentro = muros.map(m => ({ m, c: centroide(m) }));
conCentro.sort((a, b) => {
  const bandaA = Math.floor(a.c[1] / BANDA_PX);
  const bandaB = Math.floor(b.c[1] / BANDA_PX);
  if (bandaA !== bandaB) return bandaA - bandaB;
  return a.c[0] - b.c[0];
});

const COLORES = ["#ff0000", "#00aaff", "#00ff00", "#ff00ff", "#ffaa00", "#00ffff", "#ff66aa", "#aaff00", "#8800ff", "#ff8800", "#0044ff"];

const etiquetas = [];
conCentro.forEach(({ m }, idx) => {
  const numero = idx + 1;
  const color = COLORES[idx % COLORES.length];
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  m.segmentos.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.p1[0], s.p1[1]);
    ctx.lineTo(s.p2[0], s.p2[1]);
    ctx.stroke();
  });
  const pm = puntoMedio(segMasLargo(m));
  etiquetas.push({ numero, color, x: pm[0], y: pm[1] });
});

// Anti-colision: separa pares de etiquetas a menos de 45px
const MIN_SEP = 45;
for (let iter = 0; iter < 20; iter++) {
  let movido = false;
  for (let i = 0; i < etiquetas.length; i++) {
    for (let j = i + 1; j < etiquetas.length; j++) {
      const a = etiquetas[i], b = etiquetas[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < MIN_SEP && d > 0.01) {
        const dx = (b.x - a.x) / d, dy = (b.y - a.y) / d;
        const push = (MIN_SEP - d) / 2;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
        movido = true;
      } else if (d <= 0.01) {
        b.x += MIN_SEP; movido = true;
      }
    }
  }
  if (!movido) break;
}

etiquetas.forEach(({ numero, color, x, y }) => {
  ctx.font = "bold 30px sans-serif";
  const texto = String(numero);
  const w = ctx.measureText(texto).width + 14;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - 30, w, 30);
  ctx.fillStyle = "#000000";
  ctx.fillText(texto, x - w / 2 + 7, y - 6);
});

// Puertas en negro, con circulo en cada puntos_union, para dar contexto de
// donde deberian estar cortando la fusion (aunque no se rendericen numeradas)
(pagina.puertas_geo || []).forEach(p => {
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 4;
  p.segmentos.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.p1[0], s.p1[1]);
    ctx.lineTo(s.p2[0], s.p2[1]);
    ctx.stroke();
  });
  (p.puntos_union || []).forEach(pu => {
    ctx.beginPath();
    ctx.arc(pu[0], pu[1], 10, 0, Math.PI * 2);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.stroke();
  });
});

fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Guardado: ${outPath} (${muros.length} muros renumerados espacialmente)`);

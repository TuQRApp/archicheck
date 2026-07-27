// Extrae los trazos tipo curva ('c') del JSON real del notebook -- candidatos
// mucho mas confiables a arco de puerta que una estimacion visual, porque son
// coordenadas exactas del PDF vectorizado, no un click aproximado sobre un PNG.
import fs from "fs";

const data = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/archicheck_geometrico_remodelacion_pdv_23jul_0618.json", "utf8"));
const pagN1 = data.paginas.find(p => p.fname_tag === "pag2-1");

const w = pagN1.imagen_w_px;
const h = pagN1.imagen_h_px;
const curvas = pagN1.datos_vectoriales.trazos.filter(t => t.tipo === "c");

console.log(`Imagen: ${w}x${h}px`);
console.log(`Trazos tipo curva ('c') encontrados: ${curvas.length}`);
console.log(`(total trazos: ${pagN1.datos_vectoriales.n_trazos})`);

// Agrupar curvas cercanas (un arco de puerta puede ser mas de un segmento bezier)
function centro(t) {
  const xs = t.puntos.map(p => p[0]);
  const ys = t.puntos.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

const puntos = curvas.map(centro);
const grupos = [];
const usados = new Array(puntos.length).fill(false);
const RADIO_AGRUPACION = 60; // px -- arcos de la misma puerta quedan cerca

for (let i = 0; i < puntos.length; i++) {
  if (usados[i]) continue;
  const grupo = [puntos[i]];
  usados[i] = true;
  for (let j = i + 1; j < puntos.length; j++) {
    if (usados[j]) continue;
    const d = Math.hypot(puntos[i][0] - puntos[j][0], puntos[i][1] - puntos[j][1]);
    if (d < RADIO_AGRUPACION) { grupo.push(puntos[j]); usados[j] = true; }
  }
  grupos.push(grupo);
}

const centrosGrupo = grupos.map(g => {
  const cx = g.reduce((s, p) => s + p[0], 0) / g.length;
  const cy = g.reduce((s, p) => s + p[1], 0) / g.length;
  return { cx, cy, cx_rel: +(cx / w).toFixed(3), cy_rel: +(cy / h).toFixed(3), n_curvas: g.length };
});

console.log(`\nGrupos de curvas (posibles arcos de puerta): ${centrosGrupo.length}`);
centrosGrupo
  .sort((a, b) => a.cy_rel - b.cy_rel)
  .forEach((g, i) => console.log(`  G${i + 1}: cx_rel=${g.cx_rel}  cy_rel=${g.cy_rel}  (${g.n_curvas} curvas agrupadas)`));

fs.writeFileSync(
  "archicheck/Fase 2/Herramientas_CubiCasa5k/curvas_agrupadas_n1.json",
  JSON.stringify(centrosGrupo, null, 2)
);

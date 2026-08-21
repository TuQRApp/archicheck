import fs from "fs";

// Reproduce la misma renumeracion espacial que _tmp_render_conteo_muros.mjs
// para poder identificar a que entrada real del JSON corresponde cada
// numero que senalo el arquitecto (3,4,5,6,7,8,9,11).

const jsonPath = process.argv[2];
const fnameTag = process.argv[3];
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const pagina = data.paginas.find(p => p.fname_tag === fnameTag);
const muros = pagina.muros_geo || [];

function centroide(m) {
  let sx = 0, sy = 0, n = 0;
  for (const s of m.segmentos) { sx += s.p1[0] + s.p2[0]; sy += s.p1[1] + s.p2[1]; n += 2; }
  return [sx / n, sy / n];
}

const BANDA_PX = 250;
const conCentro = muros.map(m => ({ m, c: centroide(m) }));
conCentro.sort((a, b) => {
  const bandaA = Math.floor(a.c[1] / BANDA_PX);
  const bandaB = Math.floor(b.c[1] / BANDA_PX);
  if (bandaA !== bandaB) return bandaA - bandaB;
  return a.c[0] - b.c[0];
});

conCentro.forEach(({ m, c }, idx) => {
  const numero = idx + 1;
  console.log(numero, m.id, "centro:", c.map(x => Math.round(x)), "n_segmentos:", m.segmentos.length, "largo_total_m:", m.largo_total_m, "ancho_linea_prom:", m.ancho_linea_prom);
});

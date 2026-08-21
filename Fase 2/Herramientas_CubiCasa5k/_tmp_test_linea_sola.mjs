import fs from "fs";

// Prueba: un segmento largo es candidato valido a "muro" solo si tiene un
// TRAZO PARALELO CERCANO (otra cara del muro) en algun otro lugar del
// muros_geo -- a distancia de espesor de muro tipico (0.08m a 0.9m, rango
// real observado en PdV). Si no tiene compañero paralelo, es una linea
// central sola (ej. parteluz de ventana) y se descarta como candidato a
// muro real.

const jsonPath = process.argv[2];
const fnameTag = process.argv[3];
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const pagina = data.paginas.find(p => p.fname_tag === fnameTag);
const mpx = pagina.mpp;
const muros = pagina.muros_geo || [];

const ESPESOR_MIN_M = 0.08, ESPESOR_MAX_M = 0.9;
const ESPESOR_MIN_PX = ESPESOR_MIN_M / mpx, ESPESOR_MAX_PX = ESPESOR_MAX_M / mpx;
const TOL_PARALELO_DEG = 5;
const TOL_SOLAPE_MIN = 0.3; // fraccion minima de longitud que debe solaparse a lo largo del eje

function angulo(s) {
  const dx = s.p2[0] - s.p1[0], dy = s.p2[1] - s.p1[1];
  return Math.atan2(dy, dx) * 180 / Math.PI;
}
function largo(s) { return Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]); }

// Recolecta todos los segmentos "largos" (candidatos a cara de muro) de
// todas las entradas, con referencia a su muro de origen.
const TODOS = [];
muros.forEach(m => {
  m.segmentos.forEach(s => {
    if (largo(s) > ESPESOR_MAX_PX * 0.5) { // solo segmentos claramente mas largos que un espesor de muro
      TODOS.push({ s, muroId: m.id });
    }
  });
});

function anguloNorm(a) { let x = a % 180; if (x < 0) x += 180; return x; }

function tieneParalelo(seg, muroIdPropio) {
  const angA = anguloNorm(angulo(seg));
  const largoA = largo(seg);
  for (const { s: otro, muroId } of TODOS) {
    if (otro === seg) continue; // no comparar el segmento consigo mismo, pero SI permite mismo muro (2 caras pueden quedar en la misma entrada tras fusionar)
    const angB = anguloNorm(angulo(otro));
    let dAng = Math.abs(angA - angB);
    if (dAng > 90) dAng = 180 - dAng;
    if (dAng > TOL_PARALELO_DEG) continue;
    // distancia perpendicular del punto medio de "otro" a la recta de "seg"
    const [x1, y1] = seg.p1, [x2, y2] = seg.p2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const mx = (otro.p1[0] + otro.p2[0]) / 2, my = (otro.p1[1] + otro.p2[1]) / 2;
    const perp = Math.abs((mx - x1) * dy - (my - y1) * dx) / len;
    if (perp < ESPESOR_MIN_PX || perp > ESPESOR_MAX_PX) continue;
    // solape a lo largo del eje de "seg"
    const t1 = ((otro.p1[0] - x1) * dx + (otro.p1[1] - y1) * dy) / (len * len);
    const t2 = ((otro.p2[0] - x1) * dx + (otro.p2[1] - y1) * dy) / (len * len);
    const tmin = Math.max(0, Math.min(t1, t2)), tmax = Math.min(1, Math.max(t1, t2));
    const solape = Math.max(0, tmax - tmin);
    if (solape < TOL_SOLAPE_MIN) continue;
    return { otro, muroId, perp_m: (perp * mpx).toFixed(2), solape: solape.toFixed(2) };
  }
  return null;
}

console.log(`Analizando ${muros.length} muros, ${TODOS.length} segmentos largos candidatos...\n`);
const resultado = [];
muros.forEach(m => {
  let algunSegmentoTieneParalelo = false;
  let detalle = [];
  m.segmentos.forEach(s => {
    if (largo(s) <= ESPESOR_MAX_PX * 0.5) return; // ignora segmentos cortos (mullions/esquinas)
    const par = tieneParalelo(s, m.id);
    detalle.push({ p1: s.p1, p2: s.p2, largo_m: (largo(s) * mpx).toFixed(2), tiene_paralelo: !!par, info: par });
    if (par) algunSegmentoTieneParalelo = true;
  });
  resultado.push({ id: m.id, largo_total_m: m.largo_total_m, n_segmentos_largos: detalle.length, tiene_algun_paralelo: algunSegmentoTieneParalelo, detalle });
});

resultado.forEach(r => {
  const veredicto = r.n_segmentos_largos === 0 ? "SIN_SEGMENTOS_LARGOS (solo mullions/esquinas cortas)" : (r.tiene_algun_paralelo ? "TIENE PARALELO -> candidato a muro real" : "SIN PARALELO -> candidato a RECHAZAR (linea sola)");
  console.log(r.id, `largo_total=${r.largo_total_m}m`, veredicto);
});

fs.writeFileSync(process.argv[4] || "resultado_linea_sola.json", JSON.stringify(resultado, null, 2));

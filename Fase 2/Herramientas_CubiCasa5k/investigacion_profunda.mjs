// Investigacion profunda: tabla completa de coordenadas + precision (no solo
// recall) + test de offset sistematico (traslacion constante), para descartar
// o confirmar que hay "otro problema" en la interpretacion de posiciones de
// CubiCasa5K, mas alla del swap/espejo de ejes ya descartado.
import fs from "fs";

function parseGT(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line.startsWith("GT-")) continue;
    const campos = [];
    let cur = "", enComillas = false;
    for (const c of line) {
      if (c === '"') { enComillas = !enComillas; continue; }
      if (c === "," && !enComillas) { campos.push(cur); cur = ""; continue; }
      cur += c;
    }
    campos.push(cur);
    const [id, tipo, cx_rel, cy_rel] = campos;
    if (tipo === "puerta" || tipo === "ventana") rows.push({ id, tipo, cx_rel: +cx_rel, cy_rel: +cy_rel });
  }
  return rows;
}

const niveles = [
  { nombre: "Nivel 1", gt: parseGT("archicheck/Startup Chile/ground_truth_pdv_nivel1_v3.csv"), cubiTag: "pag2-1" },
  { nombre: "Nivel 2", gt: parseGT("archicheck/Startup Chile/ground_truth_pdv_nivel2_v3.csv"), cubiTag: "pag2-2" },
];
const cubi = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));

const UMBRAL_MATCH = 0.05;
const UMBRAL_PLAUSIBLE = 0.15; // para el test de offset, solo pares "cercanos-ish"

for (const nivel of niveles) {
  const registro = cubi.find(r => r.archivo.includes(nivel.cubiTag));
  console.log(`\n${"=".repeat(78)}\n${nivel.nombre} (imagen CubiCasa5K: ${registro.w}x${registro.h})\n${"=".repeat(78)}`);

  for (const tipo of ["puerta", "ventana"]) {
    const gtTipo = nivel.gt.filter(g => g.tipo === tipo);
    const detTipo = (tipo === "puerta" ? registro.puertas : registro.ventanas)
      .map((d, i) => ({ ...d, idx: i + 1 }));

    console.log(`\n--- ${tipo}s ---`);
    console.log(`GT: ${gtTipo.length} | CubiCasa5K detecto: ${detTipo.length}`);

    // tabla completa de coordenadas devueltas por CubiCasa5K, con la mejor
    // distancia a un punto real del ground truth (sin descartar por umbral)
    console.log(`\n  Tabla de detecciones CubiCasa5K (${tipo}):`);
    console.log(`  #    cx_rel  cy_rel   dist_a_GT_mas_cercano   GT_mas_cercano`);
    const distancias = [];
    detTipo.forEach(d => {
      let mejorD = Infinity, mejorGt = null;
      gtTipo.forEach(g => {
        const dist = Math.hypot(d.cx_rel - g.cx_rel, d.cy_rel - g.cy_rel);
        if (dist < mejorD) { mejorD = dist; mejorGt = g; }
      });
      distancias.push({ d, mejorD, mejorGt });
      console.log(`  ${String(d.idx).padStart(2)}   ${d.cx_rel.toFixed(3)}   ${d.cy_rel.toFixed(3)}   ${mejorD.toFixed(4).padStart(7)}                 ${mejorGt ? mejorGt.id : "-"}`);
    });

    // precision y recall con matching 1-a-1 (greedy por distancia)
    const usados = new Set();
    let matches = 0;
    const paresParaOffset = [];
    for (const g of gtTipo) {
      let mejorD = Infinity, mejorI = -1;
      detTipo.forEach((d, i) => {
        if (usados.has(i)) return;
        const dist = Math.hypot(g.cx_rel - d.cx_rel, g.cy_rel - d.cy_rel);
        if (dist < mejorD) { mejorD = dist; mejorI = i; }
      });
      if (mejorI >= 0 && mejorD < UMBRAL_MATCH) { usados.add(mejorI); matches++; }
      if (mejorI >= 0 && mejorD < UMBRAL_PLAUSIBLE) {
        paresParaOffset.push({ dx: detTipo[mejorI].cx_rel - g.cx_rel, dy: detTipo[mejorI].cy_rel - g.cy_rel, dist: mejorD });
      }
    }
    const recall = matches / gtTipo.length;
    const precision = matches / detTipo.length;
    console.log(`\n  Recall (umbral ${UMBRAL_MATCH}):    ${(recall * 100).toFixed(0)}%  (${matches}/${gtTipo.length} reales encontrados)`);
    console.log(`  Precision (umbral ${UMBRAL_MATCH}): ${(precision * 100).toFixed(0)}%  (${matches}/${detTipo.length} detecciones eran correctas)`);

    // test de offset sistematico sobre pares "plausibles" (umbral generoso)
    if (paresParaOffset.length >= 2) {
      const mDx = paresParaOffset.reduce((s, p) => s + p.dx, 0) / paresParaOffset.length;
      const mDy = paresParaOffset.reduce((s, p) => s + p.dy, 0) / paresParaOffset.length;
      const sDx = Math.sqrt(paresParaOffset.reduce((s, p) => s + (p.dx - mDx) ** 2, 0) / paresParaOffset.length);
      const sDy = Math.sqrt(paresParaOffset.reduce((s, p) => s + (p.dy - mDy) ** 2, 0) / paresParaOffset.length);
      console.log(`\n  Test de offset sistematico (${paresParaOffset.length} pares con dist<${UMBRAL_PLAUSIBLE}):`);
      console.log(`    desplazamiento promedio: dx=${mDx.toFixed(4)}  dy=${mDy.toFixed(4)}`);
      console.log(`    desviacion estandar:     dx=${sDx.toFixed(4)}  dy=${sDy.toFixed(4)}`);
      const senalConsistente = Math.abs(mDx) > sDx * 0.8 || Math.abs(mDy) > sDy * 0.8;
      console.log(`    ${senalConsistente ? ">>> Hay señal de offset consistente (promedio comparable o mayor a la dispersión) — posible bug de traslación." : "Sin señal clara de offset sistematico (el promedio es chico frente a la dispersión) — parece dispersión aleatoria, no un bug de traslación."}`);
    } else {
      console.log(`\n  Muy pocos pares plausibles (${paresParaOffset.length}) para evaluar offset sistematico.`);
    }
  }
}

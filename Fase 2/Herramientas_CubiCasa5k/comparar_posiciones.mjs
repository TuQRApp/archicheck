import fs from "fs";

function parseCSV(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n").filter(l => l.trim());
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    // split simple (los campos con comas van entre comillas, no afecta cx_rel/cy_rel/tipo)
    const parts = line.split(",");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = parts[i]));
    return obj;
  });
}

function dist(a, b) {
  return Math.sqrt((a.cx_rel - b.cx_rel) ** 2 + (a.cy_rel - b.cy_rel) ** 2);
}

function comparar(gtPath, cubiData, tipo, nombreNivel) {
  const gt = parseCSV(gtPath).filter(r => r.tipo === tipo);
  const detecciones = cubiData[tipo === "puerta" ? "puertas" : "ventanas"];

  console.log(`\n--- ${nombreNivel} — ${tipo} ---`);
  console.log(`Ground truth: ${gt.length}  |  CubiCasa5K detecto: ${detecciones.length}`);

  const usados = new Set();
  const UMBRAL = 0.06; // distancia relativa maxima para considerar "mismo elemento"
  let aciertos = 0;

  for (const g of gt) {
    const gPoint = { cx_rel: parseFloat(g.cx_rel), cy_rel: parseFloat(g.cy_rel) };
    let mejorIdx = -1, mejorD = Infinity;
    detecciones.forEach((d, i) => {
      if (usados.has(i)) return;
      const d2 = dist(gPoint, d);
      if (d2 < mejorD) { mejorD = d2; mejorIdx = i; }
    });
    const acierto = mejorIdx >= 0 && mejorD <= UMBRAL;
    if (acierto) { usados.add(mejorIdx); aciertos++; }
    console.log(
      `  ${g.id} (${gPoint.cx_rel.toFixed(2)},${gPoint.cy_rel.toFixed(2)}) -> ` +
      (mejorIdx >= 0
        ? `mas cercana a (${detecciones[mejorIdx].cx_rel.toFixed(2)},${detecciones[mejorIdx].cy_rel.toFixed(2)}) dist=${mejorD.toFixed(3)} ${acierto ? "✓ MATCH" : "✗ lejos"}`
        : "sin detecciones disponibles")
    );
  }

  const falsosPositivos = detecciones.length - usados.size;
  console.log(`\n  Recall: ${aciertos}/${gt.length} (${Math.round(100 * aciertos / gt.length)}%)`);
  console.log(`  Detecciones sin match cercano (posibles falsos positivos): ${falsosPositivos}/${detecciones.length}`);
}

const cubiJson = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));
const cubiN1 = cubiJson.find(r => r.archivo.includes("pag2-1"));
const cubiN2 = cubiJson.find(r => r.archivo.includes("pag2-2"));

comparar("archicheck/Startup Chile/ground_truth_pdv_nivel1.csv", cubiN1, "puerta", "Nivel 1");
comparar("archicheck/Startup Chile/ground_truth_pdv_nivel1.csv", cubiN1, "ventana", "Nivel 1");
comparar("archicheck/Startup Chile/ground_truth_pdv_nivel2.csv", cubiN2, "puerta", "Nivel 2");
comparar("archicheck/Startup Chile/ground_truth_pdv_nivel2.csv", cubiN2, "ventana", "Nivel 2");

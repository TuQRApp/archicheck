// Re-medicion de CubiCasa5K (thr 0.3) contra el ground truth CANONICO v3.
// Ademas prueba la hipotesis del usuario: que el conteo/deteccion sea
// razonable pero la INTERPRETACION de la posicion (mapeo a cx_rel/cy_rel)
// tenga un bug de ejes -- probando las 8 transformaciones diedricas
// (identidad, swap x<->y, espejos) y viendo si alguna mejora mucho el recall.
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
    if (tipo === "puerta" || tipo === "ventana") {
      rows.push({ id, tipo, cx_rel: +cx_rel, cy_rel: +cy_rel });
    }
  }
  return rows;
}

const TRANSFORMS = {
  "identidad":              (x, y) => [x, y],
  "swap(y,x)":               (x, y) => [y, x],
  "flipX(1-x,y)":            (x, y) => [1 - x, y],
  "flipY(x,1-y)":            (x, y) => [x, 1 - y],
  "flipXY(1-x,1-y)":         (x, y) => [1 - x, 1 - y],
  "swap+flipX(1-y,x)":       (x, y) => [1 - y, x],
  "swap+flipY(y,1-x)":       (x, y) => [y, 1 - x],
  "swap+flipXY(1-y,1-x)":    (x, y) => [1 - y, 1 - x],
};

function recallConTransform(gtPuntos, detPuntos, transformFn, umbral = 0.05) {
  const usados = new Set();
  let matches = 0;
  for (const gt of gtPuntos) {
    let mejorD = Infinity, mejorI = -1;
    detPuntos.forEach((d, i) => {
      if (usados.has(i)) return;
      const [dx, dy] = transformFn(d.cx_rel, d.cy_rel);
      const dist = Math.hypot(gt.cx_rel - dx, gt.cy_rel - dy);
      if (dist < mejorD) { mejorD = dist; mejorI = i; }
    });
    if (mejorI >= 0 && mejorD < umbral) { usados.add(mejorI); matches++; }
  }
  return { matches, total: gtPuntos.length, recall: matches / gtPuntos.length };
}

const niveles = [
  {
    nombre: "Nivel 1",
    gt: parseGT("archicheck/Startup Chile/ground_truth_pdv_nivel1_v3.csv"),
    cubiTag: "pag2-1",
  },
  {
    nombre: "Nivel 2",
    gt: parseGT("archicheck/Startup Chile/ground_truth_pdv_nivel2_v3.csv"),
    cubiTag: "pag2-2",
  },
];

const cubi = JSON.parse(fs.readFileSync("archicheck/Fase 2/Desarrollos/cubicasa5k_posiciones_thr03.json", "utf8"));

for (const nivel of niveles) {
  const registro = cubi.find(r => r.archivo.includes(nivel.cubiTag));
  console.log(`\n${"=".repeat(70)}\n${nivel.nombre}\n${"=".repeat(70)}`);

  for (const tipo of ["puerta", "ventana"]) {
    const gtTipo = nivel.gt.filter(g => g.tipo === tipo);
    const detTipo = tipo === "puerta" ? registro.puertas : registro.ventanas;
    console.log(`\n-- ${tipo}s -- GT: ${gtTipo.length}, CubiCasa5K detecto: ${detTipo.length}`);

    const resultados = Object.entries(TRANSFORMS).map(([nombre, fn]) => {
      const r = recallConTransform(gtTipo, detTipo, fn);
      return { nombre, ...r };
    }).sort((a, b) => b.recall - a.recall);

    resultados.forEach(r => {
      const marca = r.nombre === "identidad" ? " <- sin transformar (linea base)" : "";
      console.log(`   ${r.nombre.padEnd(22)} recall=${(r.recall * 100).toFixed(0).padStart(3)}%  (${r.matches}/${r.total})${marca}`);
    });

    const base = resultados.find(r => r.nombre === "identidad");
    const mejor = resultados[0];
    if (mejor.nombre !== "identidad" && mejor.recall > base.recall + 0.15) {
      console.log(`   >>> ALERTA: "${mejor.nombre}" mejora el recall +${((mejor.recall - base.recall) * 100).toFixed(0)}pp sobre la linea base -- posible bug de mapeo de ejes.`);
    }
  }
}

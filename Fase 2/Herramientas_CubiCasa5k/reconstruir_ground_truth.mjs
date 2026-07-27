// Reconstruye el ground truth a partir de las posiciones detectadas por
// deteccion de pixeles rojos (verificadas visualmente con la grilla de zoom),
// en vez de las fracciones estimadas a ojo del CSV original. La clasificacion
// tipo (puerta/ventana/escalera/rampa) por cluster se hizo por inspeccion
// visual de la grilla de zoom (verif_zoom_n1.png / verif_zoom_n2.png).
// Se preserva el contexto cualitativo (notas, ancho_aprox_m) del CSV viejo
// emparejando cada cluster nuevo con la fila vieja mas cercana DEL MISMO TIPO,
// asumiendo que la nota de contexto (ej. "Baño Personal Mujeres") sigue
// siendo valida aunque la posicion exacta haya sido corregida.
import fs from "fs";

function parseCSV(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n").map(l => l.trimEnd());
  const rows = [];
  for (const line of lines) {
    if (!line || line.startsWith("id,") || line.startsWith("NOTA") || line.startsWith("Zonas")) continue;
    // parser simple que respeta comillas
    const campos = [];
    let cur = "", enComillas = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { enComillas = !enComillas; continue; }
      if (c === "," && !enComillas) { campos.push(cur); cur = ""; continue; }
      cur += c;
    }
    campos.push(cur);
    if (campos.length < 6) continue;
    const [id, tipo, cx_rel, cy_rel, ancho_aprox_m, notas] = campos;
    rows.push({ id, tipo, cx_rel: +cx_rel, cy_rel: +cy_rel, ancho_aprox_m, notas });
  }
  return rows;
}

function nearest(cluster, candidatos) {
  let mejor = null, mejorD = Infinity;
  for (const c of candidatos) {
    const d = Math.hypot(cluster.cx_rel - c.cx_rel, cluster.cy_rel - c.cy_rel);
    if (d < mejorD) { mejorD = d; mejor = c; }
  }
  return { match: mejor, dist: mejorD };
}

function reconstruir(nivel, clustersPath, clasifPath, csvViejoPath, outCsvPath) {
  const clusters = JSON.parse(fs.readFileSync(clustersPath, "utf8"));
  const clasif = JSON.parse(fs.readFileSync(clasifPath, "utf8")); // { "1": "puerta", "20": null, ... }
  const viejo = parseCSV(csvViejoPath);

  const filas = [];
  let contador = { puerta: 0, ventana: 0, escalera: 0, rampa: 0 };

  clusters.forEach((c, i) => {
    const idx1 = i + 1;
    const tipo = clasif[String(idx1)];
    if (!tipo) return; // falso positivo, excluido

    const candidatosMismoTipo = viejo.filter(v => v.tipo === tipo);
    const { match, dist } = nearest(c, candidatosMismoTipo);

    contador[tipo]++;
    const prefijo = tipo === "puerta" ? "PU" : tipo === "ventana" ? "VE" : tipo === "escalera" ? "ES" : "RA";
    const id = `GT-${nivel}-${prefijo}${String(contador[tipo]).padStart(2, "0")}`;

    let notas = match ? match.notas : "";
    if (dist > 0.08) notas = `[revisar match, dist=${dist.toFixed(3)}] ${notas}`;

    filas.push({
      id, tipo,
      cx_rel: c.cx_rel, cy_rel: c.cy_rel,
      ancho_aprox_m: match ? match.ancho_aprox_m : "",
      notas,
    });
  });

  const header = "id,tipo,cx_rel,cy_rel,ancho_aprox_m,notas";
  const lineas = filas.map(f => {
    const notasCsv = f.notas && (f.notas.includes(",") || f.notas.includes('"'))
      ? `"${f.notas.replace(/"/g, '""')}"` : f.notas;
    return `${f.id},${f.tipo},${f.cx_rel},${f.cy_rel},${f.ancho_aprox_m},${notasCsv}`;
  });
  fs.writeFileSync(outCsvPath, [header, ...lineas].join("\n") + "\n");

  console.log(`\n=== ${nivel} ===`);
  console.log(`Total filas: ${filas.length}  (${JSON.stringify(contador)})`);
  console.log(`Guardado: ${outCsvPath}`);
  const dudosos = filas.filter(f => f.notas.startsWith("[revisar"));
  if (dudosos.length) {
    console.log(`Matches con distancia alta (revisar manualmente): ${dudosos.length}`);
    dudosos.forEach(d => console.log(`  ${d.id}: ${d.notas}`));
  }
}

reconstruir(
  "N1",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/etiquetas_n1.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/clasificacion_n1.json",
  "archicheck/Startup Chile/ground_truth_pdv_nivel1.csv",
  "archicheck/Startup Chile/ground_truth_pdv_nivel1_v2.csv"
);

reconstruir(
  "N2",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/etiquetas_n2.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/clasificacion_n2.json",
  "archicheck/Startup Chile/ground_truth_pdv_nivel2.csv",
  "archicheck/Startup Chile/ground_truth_pdv_nivel2_v2.csv"
);

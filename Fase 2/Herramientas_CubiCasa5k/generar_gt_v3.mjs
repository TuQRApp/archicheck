import fs from "fs";

function parseCsvSimple(path) {
  const lines = fs.readFileSync(path, "utf8").trim().split("\n");
  return lines.slice(1).map(l => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')));
}

const TIPO_MAP = { PU: "puerta", VE: "ventana", ES: "escalera", RA: "rampa" };
const PREFIJO = { puerta: "PU", ventana: "VE", escalera: "ES", rampa: "RA" };

function generar(nivel, inPath, outPath) {
  const filas = parseCsvSimple(inPath);
  const contador = { puerta: 0, ventana: 0, escalera: 0, rampa: 0 };
  const lineas = ["id,tipo,cx_rel,cy_rel,ancho_aprox_m,notas"];
  for (const [, marca, x, y, notas] of filas) {
    const tipo = TIPO_MAP[marca];
    contador[tipo]++;
    const id = `GT-${nivel}-${PREFIJO[tipo]}${String(contador[tipo]).padStart(2, "0")}`;
    const notasCsv = notas.includes(",") || notas.includes('"') ? `"${notas.replace(/"/g, '""')}"` : notas;
    lineas.push(`${id},${tipo},${x},${y},,${notasCsv}`);
  }
  fs.writeFileSync(outPath, lineas.join("\n") + "\n");
  console.log(`${nivel}: ${JSON.stringify(contador)} -> ${outPath}`);
}

generar("N1",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/marcas_v3_nivel1_raw.csv",
  "archicheck/Startup Chile/ground_truth_pdv_nivel1_v3.csv");

generar("N2",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/marcas_v3_nivel2_raw.csv",
  "archicheck/Startup Chile/ground_truth_pdv_nivel2_v3.csv");

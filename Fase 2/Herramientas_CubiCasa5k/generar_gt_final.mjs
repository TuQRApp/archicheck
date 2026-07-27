import fs from "fs";

function parseCsvSimple(path) {
  const lines = fs.readFileSync(path, "utf8").trim().split("\n");
  return lines.slice(1).map(l => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"')));
}

const TIPO_MAP = { PU: "puerta", VE: "ventana", ES: "escalera", RA: "rampa", MU: "muro", PE: "perimetro" };
const PREFIJO = { puerta: "PU", ventana: "VE", escalera: "ES", rampa: "RA", muro: "MU", perimetro: "PE" };

function generar(nivel, archivos, outPath, notaExtra) {
  const contador = {};
  const lineas = ["id,tipo,cx_rel,cy_rel,ancho_aprox_m,notas"];
  for (const archivo of archivos) {
    const filas = parseCsvSimple(archivo);
    for (const [, marca, x, y, notas] of filas) {
      const tipo = TIPO_MAP[marca];
      if (!tipo) { console.log(`  [!] tipo desconocido "${marca}" en ${archivo}, fila omitida`); continue; }
      contador[tipo] = (contador[tipo] || 0) + 1;
      const id = `GT-${nivel}-${PREFIJO[tipo]}${String(contador[tipo]).padStart(2, "0")}`;
      const notasCsv = notas.includes(",") || notas.includes('"') ? `"${notas.replace(/"/g, '""')}"` : notas;
      lineas.push(`${id},${tipo},${x},${y},,${notasCsv}`);
    }
  }
  if (notaExtra) lineas.push("", notaExtra);
  fs.writeFileSync(outPath, lineas.join("\n") + "\n");
  console.log(`${nivel}: ${JSON.stringify(contador)} -> ${outPath}`);
}

const NOTA_N1 = `NOTA: ground truth DEFINITIVO v13 (2026-07-23), reemplaza a _v3 y a _v12 (v13 tiene las mismas coordenadas que v12, con notas limpias/finales en vez de comentarios de correccion). Construido a mano por el usuario en "archicheck/Fase 2/Desarrollos/Test/marcas_planos_v13.xlsx" (hojas "Nivel 1 - PU-VE-ES-RA" y "Nivel 1 - MU"), verificado visualmente contra "plano_nivel1_marcado_v12.png" (mismo PNG, coordenadas identicas a v13). Incluye por primera vez categoria MU (muro, puntos de referencia sobre el eje/tramo del muro, no un contorno completo) -- habilita evaluar U-Net+MLSTRUCT-FP (Pizarro), que solo detecta muros. NO incluye todavia la categoria PE (Perimetro) acordada -- pendiente confirmar con el usuario si se agrega en una proxima vuelta. Objetivo explicito del usuario: este ground truth es para afinar al maximo la extraccion geometrica automatica (CubiCasa5K, DINO, U-Net+Pizarro, futuro detector determinista), no solo para documentar.`;
const NOTA_N2 = `NOTA: ground truth DEFINITIVO v13 (2026-07-23), reemplaza a _v3 y a _v12. Construido a mano por el usuario en "archicheck/Fase 2/Desarrollos/Test/marcas_planos_v13.xlsx" (hojas "Nivel 2 - PU-VE-ES" y "Nivel 2 - MU"), verificado visualmente contra "plano_nivel2_marcado_v12.png". Incluye por primera vez categoria MU (muro). NO incluye todavia PE (Perimetro).
NOTA GENERAL: confirmado por el usuario (2026-07-22) que en este nivel NO hay salidas de emergencia -- ninguna fila de tipo "puerta" debe re-clasificarse como salida_emergencia en este plano.`;

generar("N1",
  ["archicheck/Fase 2/Herramientas_CubiCasa5k/v13_n1_puve.csv", "archicheck/Fase 2/Herramientas_CubiCasa5k/v13_n1_mu.csv"],
  "archicheck/Startup Chile/ground_truth_pdv_nivel1_final.csv",
  NOTA_N1);

generar("N2",
  ["archicheck/Fase 2/Herramientas_CubiCasa5k/v13_n2_puve.csv", "archicheck/Fase 2/Herramientas_CubiCasa5k/v13_n2_mu.csv"],
  "archicheck/Startup Chile/ground_truth_pdv_nivel2_final.csv",
  NOTA_N2);

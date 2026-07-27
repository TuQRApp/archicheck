import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const path = "Docs archicheck/Doc prueba/Revi/05+06 Planos Rest Pza PdV (021 06 21).pdf";
const data = new Uint8Array(fs.readFileSync(path));

const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
const page = await doc.getPage(2);
const opList = await page.getOperatorList();

const OPS = pdfjsLib.OPS;
const opNames = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));

const counts = {};
for (const fn of opList.fnArray) {
  const name = opNames[fn] || `unknown_${fn}`;
  counts[name] = (counts[name] || 0) + 1;
}
console.log("Conteo de operaciones graficas por tipo:");
console.log(JSON.stringify(counts, null, 2));

// Sample a few curve/line construction ops with their args
console.log("\n--- Primeras 15 ops constructPath con sus argumentos ---");
let shown = 0;
for (let i = 0; i < opList.fnArray.length && shown < 15; i++) {
  const name = opNames[opList.fnArray[i]];
  if (name === "constructPath") {
    console.log(JSON.stringify(opList.argsArray[i]).substring(0, 300));
    shown++;
  }
}

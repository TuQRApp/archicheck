import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const path = "Docs archicheck/Doc prueba/Revi/05+06 Planos Rest Pza PdV (021 06 21).pdf";
const data = new Uint8Array(fs.readFileSync(path));

const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
console.log("Numero de paginas:", doc.numPages);

const page = await doc.getPage(2);
const textContent = await page.getTextContent();
console.log("Items de texto encontrados en pagina 2:", textContent.items.length);

const opList = await page.getOperatorList();
console.log("Operaciones graficas (vector) en pagina 2:", opList.fnArray.length);

console.log("--- Primeros 40 items de texto (con posicion) ---");
textContent.items.slice(0, 40).forEach((it) => {
  console.log(JSON.stringify(it.str), "@", it.transform ? [Math.round(it.transform[4]), Math.round(it.transform[5])] : null);
});

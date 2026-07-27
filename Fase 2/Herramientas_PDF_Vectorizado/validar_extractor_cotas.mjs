// Validacion del paso 2 del roadmap: valida que el texto extraido del PDF
// (cotas, nombres de recintos) coincide con lo que ya sabemos por el ground
// truth manual (Nivel 1 / Nivel 2 de Plaza Pedro de Valdivia).
//
// Usa pdfjs-dist (Node) en vez de PyMuPDF (que es lo que usa el notebook real
// en Python) porque no hay Python disponible en este entorno local. La logica
// es equivalente para texto: getTextContent() + viewport.convertToViewportPoint()
// da la misma posicion top-left/y-hacia-abajo que fitz. Para los trazos
// vectoriales (lineas/curvas) SI hay diferencia real de implementacion — pdfjs
// requiere resolver la matriz de transformacion a mano, fitz lo hace solo con
// get_drawings(). Esa parte se valida corriendo el notebook real en Colab.

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const ZOOM = 3; // igual al notebook

async function extraerPagina(pdfPath, pageNum, crop) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: ZOOM });
  const wFull = viewport.width;
  const hFull = viewport.height;

  const textContent = await page.getTextContent();
  const cotas = [];
  for (const item of textContent.items) {
    const texto = (item.str || "").trim();
    if (!texto) continue;
    // transform: [a,b,c,d,e,f] -- e,f son la posicion base en espacio PDF
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    if (crop) {
      const [cx1, cy1, cx2, cy2] = [crop[0] * wFull, crop[1] * hFull, crop[2] * wFull, crop[3] * hFull];
      if (x < cx1 || x > cx2 || y < cy1 || y > cy2) continue;
      cotas.push({ texto, x: Math.round(x - cx1), y: Math.round(y - cy1) });
    } else {
      cotas.push({ texto, x: Math.round(x), y: Math.round(y) });
    }
  }
  return { wFull, hFull, cotas };
}

const pdfPath = "Docs archicheck/Doc prueba/Revi/05+06 Planos Rest Pza PdV (021 06 21).pdf";

console.log("=== NIVEL 1 (crop 0.0-0.4) ===");
const n1 = await extraerPagina(pdfPath, 2, [0.0, 0.0, 0.4, 1.0]);
console.log(`Dimension pagina completa: ${Math.round(n1.wFull)}x${Math.round(n1.hFull)} px`);
console.log(`Items de texto en el crop: ${n1.cotas.length}`);

console.log("\n=== NIVEL 2 (crop 0.4-0.79) ===");
const n2 = await extraerPagina(pdfPath, 2, [0.4, 0.0, 0.79, 1.0]);
console.log(`Items de texto en el crop: ${n2.cotas.length}`);

// Cotas conocidas del ground truth manual (las que anotamos leyendo el plano)
const cotasEsperadasN1 = ["0.8", "1.5", "1.6", "1.2", "1.22", "1.4", "1.3", "1.45", "1.55", "2.9", "0.4", "0.5", "0.9", "10.58%"];
const cotasEsperadasN2 = ["0.8", "1.5"];

function verificar(nombre, cotasExtraidas, esperadas) {
  console.log(`\n--- Verificacion de cotas conocidas: ${nombre} ---`);
  const textosExtraidos = cotasExtraidas.map(c => c.texto);
  for (const esp of esperadas) {
    const encontrado = textosExtraidos.some(t => t.includes(esp) || esp.includes(t));
    console.log(`  ${encontrado ? "✓" : "✗ FALTA"}  "${esp}"`);
  }
}

verificar("Nivel 1", n1.cotas, cotasEsperadasN1);
verificar("Nivel 2", n2.cotas, cotasEsperadasN2);

console.log("\n--- Muestra de 25 items de texto extraidos, Nivel 1 (con posicion) ---");
n1.cotas.slice(0, 25).forEach(c => console.log(`  "${c.texto}" @ (${c.x}, ${c.y})`));

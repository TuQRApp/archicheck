// Parser minimo de xlsx (formato OOXML) sin dependencias externas, sobre
// la carpeta ya descomprimida por PowerShell (Expand-Archive).
import fs from "fs";

const base = process.argv[2];
const sheetFile = process.argv[3];
const outCsv = process.argv[4];

const sharedXml = fs.readFileSync(`${base}/xl/sharedStrings.xml`, "utf8");
const sharedStrings = [];
const siRegex = /<si>([\s\S]*?)<\/si>/g;
let m;
while ((m = siRegex.exec(sharedXml))) {
  const textos = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]);
  sharedStrings.push(
    textos.join("")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  );
}

const sheetXml = fs.readFileSync(`${base}/${sheetFile}`, "utf8");
const filas = {};
const rowRegex = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
let rowM;
while ((rowM = rowRegex.exec(sheetXml))) {
  const rIdx = +rowM[1];
  const celdas = {};
  // separar celdas individuales del contenido de la fila
  const cellBlocks = rowM[2].match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) || [];
  for (const block of cellBlocks) {
    const refM = block.match(/r="([A-Z]+)(\d+)"/);
    if (!refM) continue;
    const col = refM[1];
    const tipoM = block.match(/\st="([^"]*)"/);
    const tipo = tipoM ? tipoM[1] : null;
    const vM = block.match(/<v>([\s\S]*?)<\/v>/);
    const isM = block.match(/<is><t[^>]*>([\s\S]*?)<\/t><\/is>/);
    let valor = "";
    if (isM) valor = isM[1];
    else if (vM) valor = tipo === "s" ? (sharedStrings[+vM[1]] ?? "") : vM[1];
    celdas[col] = valor;
  }
  filas[rIdx] = celdas;
}

const maxRow = Math.max(...Object.keys(filas).map(Number));
const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
const lineas = [];
for (let r = 1; r <= maxRow; r++) {
  const fila = filas[r] || {};
  const vals = cols.map(c => (fila[c] ?? ""));
  while (vals.length && vals[vals.length - 1] === "") vals.pop();
  if (vals.length === 0 && r !== 1) continue;
  lineas.push(vals.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
}
fs.writeFileSync(outCsv, lineas.join("\n") + "\n");
console.log(`Guardado: ${outCsv} (${lineas.length} filas)`);

import fs from "fs";

const DOC_PRUEBA = "Docs archicheck/Doc prueba";
const BACKUP_DIR = `${DOC_PRUEBA}/Versiones anteriores`;

function timestamp() {
  const d = new Date();
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const dd = String(d.getDate()).padStart(2, "0");
  const mes = meses[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  return `${dd}${mes}_${hh}`;
}

// El archivo vivo SIEMPRE lleva timestamp en el nombre (2026-07-24: antes solo
// las copias en 'Versiones anteriores' lo llevaban, y el nombre fijo del vivo
// ("...21jul.ipynb") generaba confusion real -- el contenido cambiaba pero el
// nombre no, pareciendo desactualizado. Ahora se busca el vivo dinamicamente
// (unico .ipynb directo en Doc prueba, no dentro de Versiones anteriores) en
// vez de un nombre hardcodeado, porque el nombre cambia en cada edicion.
const vivosActuales = fs.readdirSync(DOC_PRUEBA)
  .filter(f => f.endsWith(".ipynb"))
  .map(f => `${DOC_PRUEBA}/${f}`);

if (vivosActuales.length !== 1) {
  throw new Error(
    `Se esperaba exactamente 1 notebook vivo en '${DOC_PRUEBA}', se encontraron ${vivosActuales.length}: ${vivosActuales.join(", ")}. ` +
    `Revisar a mano antes de continuar -- no se toco nada.`
  );
}
const NOTEBOOK_VIEJO = vivosActuales[0];

// 1) Mover (no copiar) el vivo actual a Versiones anteriores, conservando su
//    nombre (ya tiene timestamp propio, sirve como registro de esa version)
const nombreBackup = NOTEBOOK_VIEJO.split("/").pop();
const backupPath = `${BACKUP_DIR}/${nombreBackup}`;
fs.copyFileSync(NOTEBOOK_VIEJO, backupPath);
console.log(`Backup guardado: ${backupPath}`);

// 2) Cargar el contenido del que era el vivo, aplicar el cambio
const nb = JSON.parse(fs.readFileSync(NOTEBOOK_VIEJO, "utf8"));
const nuevaFuente = fs.readFileSync(
  process.argv[2] || "archicheck/Fase 2/Herramientas_CubiCasa5k/_celda4_nueva.py", "utf8"
);

const idx = nb.cells.findIndex(c => c.id === "cell-4");
if (idx === -1) throw new Error("No se encontro la celda id=cell-4");

// Jupyter espera 'source' como lista de lineas, cada una terminada en \n
// excepto la ultima. Reconstruimos ese formato.
const lineas = nuevaFuente.split("\n");
const source = lineas.map((l, i) => i < lineas.length - 1 ? l + "\n" : l);
if (source.length && source[source.length - 1] === "") source.pop();

nb.cells[idx].source = source;
nb.cells[idx].outputs = [];
nb.cells[idx].execution_count = null;

// 3) Escribir el nuevo vivo con timestamp FRESCO en el nombre, y borrar el
//    viejo de Doc prueba (solo debe quedar 1 archivo vivo ahi, para que no
//    haya ambiguedad sobre cual subir a Colab)
const NOTEBOOK_NUEVO = `${DOC_PRUEBA}/ArchiCheck_Base ${timestamp()}.ipynb`;
fs.writeFileSync(NOTEBOOK_NUEVO, JSON.stringify(nb, null, 1));
fs.unlinkSync(NOTEBOOK_VIEJO);

console.log(`Nuevo archivo vivo: ${NOTEBOOK_NUEVO}`);
console.log(`Lineas nuevas en Celda 4: ${source.length}`);

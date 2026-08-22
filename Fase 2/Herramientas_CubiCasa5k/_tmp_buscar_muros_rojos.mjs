import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const src = process.argv[2];
const data = new Uint8Array(fs.readFileSync(src));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
const page = await doc.getPage(2);
const ZOOM = 3;
const viewport = page.getViewport({ scale: ZOOM });
const opList = await page.getOperatorList();
const opsInv = {};
for (const k in OPS) opsInv[OPS[k]] = k;

function mul(m1, m2) {
  return [
    m1[0]*m2[0] + m1[2]*m2[1], m1[1]*m2[0] + m1[3]*m2[1],
    m1[0]*m2[2] + m1[2]*m2[3], m1[1]*m2[2] + m1[3]*m2[3],
    m1[0]*m2[4] + m1[2]*m2[5] + m1[4], m1[1]*m2[4] + m1[3]*m2[5] + m1[5],
  ];
}
function applyPt(m, x, y) { return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }
function parsePacked(flat) {
  const pts = []; let j = 0;
  while (j < flat.length) {
    const code = flat[j];
    if (code === 0 || code === 1) { pts.push([flat[j+1], flat[j+2]]); j += 3; }
    else if (code === 2) { pts.push([flat[j+1],flat[j+2]],[flat[j+3],flat[j+4]],[flat[j+5],flat[j+6]]); j += 7; }
    else break;
  }
  return pts;
}

let ctmStack = [], ctm = [1,0,0,1,0,0];
let fillColor = null;
let fillStack = [];
const fnArray = opList.fnArray, argsArray = opList.argsArray;

const N1_X_MAX = 2861, N2_X_MAX = 5651;

for (let i = 0; i < fnArray.length; i++) {
  const name = opsInv[fnArray[i]];
  const args = argsArray[i];
  if (name === "save") { ctmStack.push(ctm.slice()); fillStack.push(fillColor); }
  else if (name === "restore") { ctm = ctmStack.pop() || ctm; fillColor = fillStack.pop() ?? fillColor; }
  else if (name === "transform") { ctm = mul(ctm, args); }
  else if (name === "setFillRGBColor") { fillColor = args[0]; }
  else if (name === "constructPath") {
    if (fillColor !== "#ff0000") continue;
    const flat = args[1][0];
    const pts = parsePacked(flat);
    if (pts.length < 4) continue;
    const full = mul(viewport.transform, ctm);
    const pxPts = pts.map(([x,y]) => applyPt(full, x, y));
    const xs = pxPts.map(p=>p[0]), ys = pxPts.map(p=>p[1]);
    const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
    const w = x1-x0, h = y1-y0;
    if (w < 5 || h < 5) continue; // descarta trazos de achurado, no el contorno
    const nivel = x1 <= N1_X_MAX ? "N1" : (x0 >= N1_X_MAX ? "N2" : "?");
    const xLocal = nivel === "N2" ? x0 - N1_X_MAX : x0;
    console.log(`op#${i} nivel=${nivel} bbox_px=(${Math.round(x0)},${Math.round(y0)})-(${Math.round(x1)},${Math.round(y1)}) local_x0=${Math.round(xLocal)} w=${Math.round(w)} h=${Math.round(h)}`);
  }
}

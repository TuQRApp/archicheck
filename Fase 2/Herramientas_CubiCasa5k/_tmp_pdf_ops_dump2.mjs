import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const src = process.argv[2];
const pageNum = Number(process.argv[3]);
const TARGET_X = Number(process.argv[4]);
const TARGET_Y = Number(process.argv[5]);
const RADIUS = Number(process.argv[6] || 40);

const data = new Uint8Array(fs.readFileSync(src));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
const page = await doc.getPage(pageNum);
const ZOOM = 3;
const viewport = page.getViewport({ scale: ZOOM });
console.log("viewport", viewport.width, viewport.height);

const opList = await page.getOperatorList();
const opsInv = {};
for (const k in OPS) opsInv[OPS[k]] = k;

function mul(m1, m2) {
  return [
    m1[0]*m2[0] + m1[2]*m2[1],
    m1[1]*m2[0] + m1[3]*m2[1],
    m1[0]*m2[2] + m1[2]*m2[3],
    m1[1]*m2[2] + m1[3]*m2[3],
    m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
    m1[1]*m2[4] + m1[3]*m2[5] + m1[5],
  ];
}
function applyPt(m, x, y) { return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }

// parse packed constructPath flat array: sequence of (code,x,y) triples for
// code 0(moveTo)/1(lineTo), (code,x1,y1,x2,y2,x3,y3) 7-wide for code 2(curveTo).
// stop silently on desync (any other leading value).
function parsePacked(flat) {
  const pts = [];
  let j = 0;
  while (j < flat.length) {
    const code = flat[j];
    if (code === 0 || code === 1) {
      pts.push([flat[j+1], flat[j+2]]);
      j += 3;
    } else if (code === 2) {
      pts.push([flat[j+1], flat[j+2]]);
      pts.push([flat[j+3], flat[j+4]]);
      pts.push([flat[j+5], flat[j+6]]);
      j += 7;
    } else {
      break; // desync or unknown code, stop
    }
  }
  return pts;
}

let ctmStack = [];
let ctm = [1,0,0,1,0,0];
let fillColor = null, strokeColor = null;
let fillStack = [], strokeStack = [];

const fnArray = opList.fnArray;
const argsArray = opList.argsArray;

let found = 0;
for (let i = 0; i < fnArray.length; i++) {
  const fn = fnArray[i];
  const args = argsArray[i];
  const name = opsInv[fn];

  if (name === "save") {
    ctmStack.push(ctm.slice());
    fillStack.push(fillColor); strokeStack.push(strokeColor);
  } else if (name === "restore") {
    ctm = ctmStack.pop() || ctm;
    fillColor = fillStack.pop() ?? fillColor;
    strokeColor = strokeStack.pop() ?? strokeColor;
  } else if (name === "transform") {
    ctm = mul(ctm, args);
  } else if (name === "setFillRGBColor") {
    fillColor = args.map(v => Math.round(v*100)/100);
  } else if (name === "setStrokeRGBColor") {
    strokeColor = args.map(v => Math.round(v*100)/100);
  } else if (name === "constructPath") {
    const flat = args[1][0];
    const pts = parsePacked(flat);
    if (pts.length === 0) continue;
    const full = mul(viewport.transform, ctm);
    const pxPts = pts.map(([x,y]) => applyPt(full, x, y));
    const near = pxPts.some(([px,py]) => Math.hypot(px-TARGET_X, py-TARGET_Y) < RADIUS);
    if (near) {
      found++;
      console.log(`--- op#${i} n_pts=${pts.length} fill=${JSON.stringify(fillColor)} stroke=${JSON.stringify(strokeColor)}`);
      console.log("  px pts:", pxPts.map(p=>p.map(v=>Math.round(v))));
    }
  }
}
console.log("total matching ops:", found);

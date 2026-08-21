import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const src = process.argv[2];
const pageNum = Number(process.argv[3]);
const data = new Uint8Array(fs.readFileSync(src));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
const page = await doc.getPage(pageNum);
const ZOOM = 3;
const viewport = page.getViewport({ scale: ZOOM });
console.log("viewport", viewport.width, viewport.height, "rotation", viewport.rotation);

const opList = await page.getOperatorList();

const opsInv = {};
for (const k in OPS) opsInv[OPS[k]] = k;

// target point in FULL-PAGE pixel space (recorte1 offset=0, so local==full for x here)
const TARGET_X = Number(process.argv[4]);
const TARGET_Y = Number(process.argv[5]);
const RADIUS = Number(process.argv[6] || 40);

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
function applyPt(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

let ctmStack = [[1,0,0,1,0,0]];
let ctm = [1,0,0,1,0,0];
let fillColor = null, strokeColor = null;
let fillStack = [null], strokeStack = [null];

const fnArray = opList.fnArray;
const argsArray = opList.argsArray;

let found = 0;
for (let i = 0; i < fnArray.length; i++) {
  const fn = fnArray[i];
  const args = argsArray[i];
  const name = opsInv[fn];

  if (name === "save") {
    ctmStack.push(ctm.slice());
    fillStack.push(fillColor);
    strokeStack.push(strokeColor);
  } else if (name === "restore") {
    ctm = ctmStack.pop() || ctm;
    fillColor = fillStack.pop() ?? fillColor;
    strokeColor = strokeStack.pop() ?? strokeColor;
  } else if (name === "transform") {
    ctm = mul(ctm, args);
  } else if (name === "setFillRGBColor") {
    fillColor = args.map(v => Math.round(v * 100) / 100);
  } else if (name === "setStrokeRGBColor") {
    strokeColor = args.map(v => Math.round(v * 100) / 100);
  } else if (name === "setFillColorN" || name === "setStrokeColorN") {
    // pattern/separation color, skip detail
  } else if (name === "constructPath") {
    const [ops, coords] = args;
    let pts = [];
    let ci = 0;
    for (const o of ops) {
      if (o === OPS.moveTo || o === OPS.lineTo) {
        pts.push([coords[ci], coords[ci+1]]);
        ci += 2;
      } else if (o === OPS.curveTo) {
        pts.push([coords[ci], coords[ci+1]]);
        pts.push([coords[ci+2], coords[ci+3]]);
        pts.push([coords[ci+4], coords[ci+5]]);
        ci += 6;
      } else if (o === OPS.rectangle) {
        pts.push([coords[ci], coords[ci+1]]);
        pts.push([coords[ci]+coords[ci+2], coords[ci+1]]);
        pts.push([coords[ci]+coords[ci+2], coords[ci+1]+coords[ci+3]]);
        pts.push([coords[ci], coords[ci+1]+coords[ci+3]]);
        ci += 4;
      } else if (o === OPS.closePath) {
        // no coords
      }
    }
    // transform through ctm then viewport
    const full = mul(viewport.transform, ctm);
    const pxPts = pts.map(([x,y]) => applyPt(full, x, y));
    const near = pxPts.some(([px,py]) => Math.hypot(px-TARGET_X, py-TARGET_Y) < RADIUS);
    if (near) {
      found++;
      console.log(`--- op#${i} constructPath, n_ops=${ops.length}, fill=${JSON.stringify(fillColor)} stroke=${JSON.stringify(strokeColor)}`);
      console.log("  raw pts (user space):", pts.map(p=>p.map(v=>Math.round(v*100)/100)));
      console.log("  px pts (full-page pixel space):", pxPts.map(p=>p.map(v=>Math.round(v))));
    }
  } else if (name === "fill" || name === "eoFill" || name === "stroke" || name === "fillStroke" || name === "eoFillStroke") {
    // paint op, color already tracked above at time of setFillRGBColor before constructPath+paint
  }
}
console.log("total matching constructPath ops found:", found);

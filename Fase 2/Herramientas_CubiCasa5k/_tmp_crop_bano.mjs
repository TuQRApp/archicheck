import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const img = await loadImage(src);

const x1=1850,y1=1450,w1=800,h1=1050;
let c = createCanvas(w1,h1); let ctx = c.getContext("2d");
ctx.drawImage(img, x1,y1,w1,h1, 0,0,w1,h1);
fs.writeFileSync(process.argv[3], c.toBuffer("image/png"));

const x2=2240,y2=2080,w2=120,h2=160;
let c2 = createCanvas(w2*4,h2*4); let ctx2 = c2.getContext("2d");
ctx2.imageSmoothingEnabled = false;
ctx2.drawImage(img, x2,y2,w2,h2, 0,0,w2*4,h2*4);
fs.writeFileSync(process.argv[4], c2.toBuffer("image/png"));

console.log("done");

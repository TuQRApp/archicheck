import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const src = process.argv[2];
const img = await loadImage(src);

const x1=1850,y1=1450,w1=800,h1=1050;
let c = createCanvas(w1,h1); let ctx = c.getContext("2d");
ctx.drawImage(img, x1,y1,w1,h1, 0,0,w1,h1);
// annotate the zone matching idx 2188-2321 (diagonal-angle segments), in local coords
ctx.strokeStyle = "blue";
ctx.lineWidth = 4;
ctx.strokeRect(2280-x1-10, 2112-y1-5, (2300-2280)+30, (2270-2112)+10);
fs.writeFileSync(process.argv[3], c.toBuffer("image/png"));

console.log("done");

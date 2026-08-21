import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

const [,, srcPath, x, y, w, h, outPath] = process.argv;
const img = await loadImage(srcPath);
const canvas = createCanvas(Number(w), Number(h));
const ctx = canvas.getContext("2d");
ctx.drawImage(img, Number(x), Number(y), Number(w), Number(h), 0, 0, Number(w), Number(h));
fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("saved", outPath);

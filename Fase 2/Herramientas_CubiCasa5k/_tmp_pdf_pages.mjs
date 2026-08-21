import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "fs";

const src = process.argv[2];
const data = new Uint8Array(fs.readFileSync(src));
const doc = await getDocument({ data, useSystemFonts: true }).promise;
console.log("numPages:", doc.numPages);
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const vp = page.getViewport({ scale: 1 });
  console.log(`page ${i}: rotate=${page.rotate} view=${JSON.stringify(page.view)} width=${vp.width} height=${vp.height}`);
}

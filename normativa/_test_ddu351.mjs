import { readFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const pdfjsPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const workerPath = join(__dir, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');

const pdfjsMod = await import(pathToFileURL(pdfjsPath).href);
const pdfjs = pdfjsMod.default ?? pdfjsMod;
const GO = pdfjs.GlobalWorkerOptions ?? pdfjsMod.GlobalWorkerOptions;
GO.workerSrc = pathToFileURL(workerPath).href;

const buf = readFileSync(join(__dir, 'nacional/Fuentes/DDU 351_Accesibilidad.pdf'));
const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
console.log('Paginas:', doc.numPages);

let totalChars = 0;
for (let i = 1; i <= Math.min(5, doc.numPages); i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map(item => item.str || '').join(' ').trim();
  totalChars += text.length;
  console.log(`Pag ${i} (${text.length} chars): ${text.substring(0, 250)}`);
}
console.log('Total chars primeras 5 pags:', totalChars);

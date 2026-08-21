import fs from 'fs';
import sharp from 'sharp';

const d = JSON.parse(fs.readFileSync('../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235.json', 'utf8'));
const p = d.paginas.find(x => x.fname_tag === 'pag3-2');
const base = '../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235_pag3-2.png';
const out = '../Desarrollos/Test/Beauchef/conteo_manual_muros_kiosco_v3.png';

function esDegenerado(m) { const s0 = m.segmentos[0]; return s0.p1[0] === s0.p2[0] && s0.p1[1] === s0.p2[1] && m.segmentos.length === 1; }
// icono de accesibilidad confirmado (silla de ruedas), no es muro
const ICONO = new Set(['MU85', 'MU86', 'MU87', 'MU88', 'MU89', 'MU90', 'MU92', 'MU93', 'MU94', 'MU95', 'MU96', 'MU97']);

const candidatos = p.muros_geo.filter(m => !esDegenerado(m) && !ICONO.has(m.id));
console.log(`candidatos: ${candidatos.length} (excluidos ${p.muros_geo.length - candidatos.length} degenerados/icono)`);

function distPuntoSeg(px, py, ax, ay, bx, by) { const abx = bx - ax, aby = by - ay; const apx = px - ax, apy = py - ay; const ab2 = abx * abx + aby * aby; let t = ab2 ? (apx * abx + apy * aby) / ab2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * abx), py - (ay + t * aby)); }
function distMuros(m1, m2) { let best = Infinity; for (const s1 of m1.segmentos) for (const pt of [s1.p1, s1.p2]) for (const s2 of m2.segmentos) { const dd = distPuntoSeg(pt[0], pt[1], s2.p1[0], s2.p1[1], s2.p2[0], s2.p2[1]); if (dd < best) best = dd; } for (const s2 of m2.segmentos) for (const pt of [s2.p1, s2.p2]) for (const s1 of m1.segmentos) { const dd = distPuntoSeg(pt[0], pt[1], s1.p1[0], s1.p1[1], s1.p2[0], s1.p2[1]); if (dd < best) best = dd; } return best; }
function agrupar(cands, tol) {
  const n = cands.length; const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (distMuros(cands[i], cands[j]) <= tol) union(i, j);
  const grupos = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(cands[i]); }
  return [...grupos.values()];
}
const grupos = agrupar(candidatos, 10);

const colores = ['#E6194B', '#3CB44B', '#4363D8', '#F58231', '#911EB4', '#42D4F4', '#F032E6', '#BFEF45', '#469990', '#9A6324', '#800000', '#000075'];
function puntoMedio(g) { const pts = g.flatMap(m => m.segmentos.flatMap(s => [s.p1, s.p2])); const xs = pts.map(pp => pp[0]), ys = pts.map(pp => pp[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }
const conPunto = grupos.map(g => { const [mx, my] = puntoMedio(g); return { g, mx, my }; });
conPunto.sort((a, b) => b.g.length - a.g.length);

const svgParts = [];
conPunto.forEach((item, i) => {
  const n = i + 1; const color = colores[i % colores.length];
  for (const m of item.g) for (const s of m.segmentos) svgParts.push(`<line x1="${s.p1[0]}" y1="${s.p1[1]}" x2="${s.p2[0]}" y2="${s.p2[1]}" stroke="${color}" stroke-width="6" stroke-opacity="0.8" />`);
  svgParts.push(`<circle cx="${item.mx}" cy="${item.my}" r="8" fill="${color}" stroke="#000" stroke-width="1.5" />`);
  svgParts.push(`<text x="${item.mx + 12}" y="${item.my - 12}" font-size="34" fill="#000" font-weight="bold" stroke="#fff" stroke-width="4" paint-order="stroke">${n}</text>`);
  console.log(`Grupo ${n}: n_muros=${item.g.length} largo_sum=${item.g.reduce((a, m) => a + m.largo_total_m, 0).toFixed(1)}m ids=${item.g.map(m => m.id).join(',')}`);
});

const meta = await sharp(base).metadata();
const svg = `<svg width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}">${svgParts.join('\n')}</svg>`;
await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).toFile(out);
console.log('OK ->', out, `(${conPunto.length} grupos)`);

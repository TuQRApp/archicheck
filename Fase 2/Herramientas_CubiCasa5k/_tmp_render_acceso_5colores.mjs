import fs from 'fs';
import sharp from 'sharp';

const d = JSON.parse(fs.readFileSync('../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235.json', 'utf8'));
const p = d.paginas.find(x => x.fname_tag === 'pag3-1');
const base = '../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235_pag3-1.png';
const out = '../Desarrollos/Test/Beauchef/conteo_manual_muros_acceso_v4_5colores.png';

const AMARILLO = ['MU19', 'MU20', 'MU22'];
const NARANJO = ['MU16', 'MU17', 'MU18'];
const VERDE = ['MU52', 'MU53'];
const VIOLETA_CLARO = ['MU54', 'MU57', 'MU58', 'MU59', 'MU60', 'MU61', 'MU62', 'MU63', 'MU66', 'MU67', 'MU68'];

// contaminacion / artefactos a excluir de "violeta" (no son muro real)
const EXCLUIR = new Set([
  'MU194', 'MU195', 'MU196', 'MU249', 'MU250', 'MU251', 'MU252',
  ...p.muros_geo.filter(m => {
    const pts = m.segmentos.flatMap(s => [s.p1, s.p2]);
    const yProm = pts.reduce((a, pp) => a + pp[1], 0) / pts.length;
    return Math.abs(yProm - 1108) < 40; // banda ancha CORTE A + simbolo circulo/triangulo
  }).map(m => m.id),
]);

function esDegenerado(m) { const s0 = m.segmentos[0]; return s0.p1[0] === s0.p2[0] && s0.p1[1] === s0.p2[1] && m.segmentos.length === 1; }

const idsEspeciales = new Set([...AMARILLO, ...NARANJO, ...VERDE, ...VIOLETA_CLARO]);
const violeta = p.muros_geo.filter(m => !esDegenerado(m) && !idsEspeciales.has(m.id) && !EXCLUIR.has(m.id));

const grupos = [
  { nombre: 'AMARILLO (L, Guardia)', color: '#FFD700', ids: AMARILLO },
  { nombre: 'NARANJO (vertical, Guardia) - CANDIDATO, confirmar', color: '#FF8C00', ids: NARANJO },
  { nombre: 'VERDE (Baño) - CANDIDATO, confirmar', color: '#00A651', ids: VERDE },
  { nombre: 'VIOLETA CLARO (Baño) - CANDIDATO, confirmar', color: '#C299FC', ids: VIOLETA_CLARO },
  { nombre: 'VIOLETA (todo lo demas, red grande)', color: '#5B2C6F', ids: violeta.map(m => m.id) },
];

const svgParts = [];
for (const g of grupos) {
  for (const id of g.ids) {
    const m = p.muros_geo.find(x => x.id === id);
    if (!m) { console.log('NO ENCONTRADO', id); continue; }
    for (const s of m.segmentos) {
      svgParts.push(`<line x1="${s.p1[0]}" y1="${s.p1[1]}" x2="${s.p2[0]}" y2="${s.p2[1]}" stroke="${g.color}" stroke-width="6" stroke-opacity="0.8" />`);
    }
  }
  console.log(g.nombre, '->', g.ids.length, 'entradas');
}

const meta = await sharp(base).metadata();
const svg = `<svg width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}">${svgParts.join('\n')}</svg>`;
await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).toFile(out);
console.log('OK ->', out);

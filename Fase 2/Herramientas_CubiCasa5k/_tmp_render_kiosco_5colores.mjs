import fs from 'fs';
import sharp from 'sharp';

const d = JSON.parse(fs.readFileSync('../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235.json', 'utf8'));
const p = d.paginas.find(x => x.fname_tag === 'pag3-2');
const base = '../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235_pag3-2.png';
const out = '../Desarrollos/Test/Beauchef/conteo_manual_muros_kiosco_v4_colores.png';

const ICONO = new Set(['MU85', 'MU86', 'MU87', 'MU88', 'MU89', 'MU90', 'MU92', 'MU93', 'MU94', 'MU95', 'MU96', 'MU97']);
// candidato: divisor vertical Kiosco/Baño-chico <-> Enfermeria
const AMARILLO = ['MU79', 'MU67', 'MU66', 'MU68', 'MU77', 'MU78', 'MU80'];
// candidato: divisor entre los 2 Baños (toilets) de la derecha
const PURPURA = ['MU08', 'MU09', 'MU10', 'MU11'];
// candidato: nicho propio del Kiosco (esquina inferior izquierda)
const ROJO = ['MU29', 'MU30', 'MU31', 'MU32', 'MU33', 'MU34', 'MU35', 'MU36', 'MU37', 'MU38', 'MU39', 'MU40', 'MU41', 'MU42', 'MU43', 'MU44', 'MU45', 'MU46', 'MU47'];
// pieza chica cerca del icono, separada (candidato "verde")
const VERDE = ['MU58'];
// banda superior separada (puerta PG01) - se mantiene como grupos propios, no se asigna a ningun color todavia
const SIN_CLASIFICAR = ['MU01', 'MU02', 'MU03', 'MU04', 'MU81', 'MU82', 'MU83', 'MU84'];

function esDegenerado(m) { const s0 = m.segmentos[0]; return s0.p1[0] === s0.p2[0] && s0.p1[1] === s0.p2[1] && m.segmentos.length === 1; }
const idsEspeciales = new Set([...AMARILLO, ...PURPURA, ...ROJO, ...VERDE, ...SIN_CLASIFICAR]);
const cyan = p.muros_geo.filter(m => !esDegenerado(m) && !ICONO.has(m.id) && !idsEspeciales.has(m.id));

const grupos = [
  { nombre: 'CYAN (resto, red grande)', color: '#00AEEF', ids: cyan.map(m => m.id) },
  { nombre: 'AMARILLO (divisor Kiosco/Enfermeria) - CANDIDATO', color: '#FFD700', ids: AMARILLO },
  { nombre: 'PURPURA (entre los 2 Baños) - CANDIDATO', color: '#911EB4', ids: PURPURA },
  { nombre: 'ROJO (nicho Kiosco) - CANDIDATO', color: '#E6194B', ids: ROJO },
  { nombre: 'VERDE (cerca del icono) - CANDIDATO', color: '#3CB44B', ids: VERDE },
  { nombre: 'SIN CLASIFICAR (banda puerta PG01)', color: '#808080', ids: SIN_CLASIFICAR },
];

const svgParts = [];
for (const g of grupos) {
  for (const id of g.ids) {
    const m = p.muros_geo.find(x => x.id === id);
    if (!m) { console.log('NO ENCONTRADO', id); continue; }
    for (const s of m.segmentos) svgParts.push(`<line x1="${s.p1[0]}" y1="${s.p1[1]}" x2="${s.p2[0]}" y2="${s.p2[1]}" stroke="${g.color}" stroke-width="6" stroke-opacity="0.85" />`);
  }
  console.log(g.nombre, '->', g.ids.length, 'entradas');
}

const meta = await sharp(base).metadata();
const svg = `<svg width="${meta.width}" height="${meta.height}" viewBox="0 0 ${meta.width} ${meta.height}">${svgParts.join('\n')}</svg>`;
await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).toFile(out);
console.log('OK ->', out);

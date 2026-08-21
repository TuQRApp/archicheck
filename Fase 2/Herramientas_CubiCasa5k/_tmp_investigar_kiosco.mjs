import fs from 'fs';
const d = JSON.parse(fs.readFileSync('../Desarrollos/Test/Beauchef/archicheck_geometrico_beauchef_19ago_2235.json', 'utf8'));
const p = d.paginas.find(x => x.fname_tag === 'pag3-2');

function esDegenerado(m) { const s0 = m.segmentos[0]; return s0.p1[0] === s0.p2[0] && s0.p1[1] === s0.p2[1] && m.segmentos.length === 1; }
const candidatos = p.muros_geo.filter(m => !esDegenerado(m));

// Excluir corte/rasante: banda ancha alrededor de y donde aparecen muchos
// fragmentos cortos y evenly-spaced (mismo patron que Acceso)
function bboxOf(m) {
  const pts = m.segmentos.flatMap(s => [s.p1, s.p2]);
  const xs = pts.map(pp => pp[0]), ys = pts.map(pp => pp[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

console.log(`Total candidatos (sin degenerados): ${candidatos.length}\n`);
for (const m of candidatos) {
  const b = bboxOf(m);
  console.log(m.id, m.largo_total_m + 'm', `x:${b.minX}-${b.maxX} y:${b.minY}-${b.maxY}`);
}

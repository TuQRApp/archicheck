/**
 * _idx_prc.mjs — Indexa PRC Providencia en Supabase:
 *   1. Ordenanza refundida (texto por artículo)
 *   2. normas_edificacion.json (parámetros por zona)
 *   3. usos_suelo.json (usos por zona)
 *   4. patrimonio.json (inmuebles protegidos)
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir        = dirname(fileURLToPath(import.meta.url));
const OPENAI_KEY   = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const HDR = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

// ── Borrar PRC-PRV existente ───────────────────────────────────────────────────
console.log('Borrando chunks PRC-PRV existentes...');
const del = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?fuente=eq.PRC-PRV`, {
  method: 'DELETE', headers: { ...HDR, 'Prefer': 'return=minimal' },
});
if (!del.ok) { console.error(await del.text()); process.exit(1); }
console.log('  Eliminados.');

// ── Construir chunks ───────────────────────────────────────────────────────────
const chunks = [];

// 1. Ordenanza refundida
const ord = JSON.parse(readFileSync(join(__dir, 'providencia/ordenanza_refundida.json'), 'utf-8'));
for (const s of ord.secciones) {
  if (!s.texto || s.texto.trim().length < 30) continue;
  chunks.push({
    fuente: 'PRC-PRV', codigo: s.codigo,
    titulo: `PRC Providencia — ${s.codigo}`,
    texto: s.texto.trim().substring(0, 6500),
    metadata: { tipo: 'ordenanza', comuna: 'Providencia' },
  });
}
console.log(`  Ordenanza: ${ord.secciones.length} artículos`);

// 2. Normas de edificación por zona — texto en lenguaje natural para mejor embedding
const normas = JSON.parse(readFileSync(join(__dir, 'providencia/normas_edificacion.json'), 'utf-8'));
for (const [zonaId, z] of Object.entries(normas)) {
  if (zonaId.startsWith('_') || !z.nombre) continue;
  const agrup = Array.isArray(z.agrupamiento) ? z.agrupamiento.join(', ') : z.agrupamiento || 'no especificado';
  // Frase introductoria en lenguaje natural para mejorar recuperación semántica
  const intro = `En el Plan Regulador Comunal de Providencia (PRC Providencia), la Zona ${zonaId} — ${z.nombre} — permite edificación ${agrup}` +
    (z.coef_constructibilidad != null ? ` con coeficiente de constructibilidad ${z.coef_constructibilidad}` : '') +
    (z.altura_maxima_pisos != null ? `, altura máxima ${z.altura_maxima_pisos} pisos` : '') +
    (z.altura_maxima_m != null ? ` (${z.altura_maxima_m} m)` : '') +
    (z.coef_ocupacion_suelo_1p != null ? `, coeficiente de ocupación de suelo (COS) ${z.coef_ocupacion_suelo_1p}` : '') +
    (z.subdivision_predial_minima_m2 != null ? `, subdivisión predial mínima ${z.subdivision_predial_minima_m2} m²` : '') + '.';
  const lineas = [
    intro,
    `Agrupamiento: ${agrup}`,
    z.subdivision_predial_minima_m2 != null ? `Subdivisión predial mínima: ${z.subdivision_predial_minima_m2} m²` : null,
    z.coef_constructibilidad != null ? `Coeficiente de constructibilidad: ${z.coef_constructibilidad}` : null,
    z.coef_ocupacion_suelo_1p != null ? `COS primer piso: ${z.coef_ocupacion_suelo_1p}` : null,
    z.coef_ocupacion_suelo_ps != null ? `COS pisos superiores: ${z.coef_ocupacion_suelo_ps}` : null,
    z.altura_maxima_m != null ? `Altura máxima: ${z.altura_maxima_m} m` : null,
    z.altura_maxima_pisos != null ? `Altura máxima: ${z.altura_maxima_pisos} pisos` : null,
    z.antejardín_m != null ? `Antejardín: ${z.antejardín_m} m` : null,
    z.antejardín_nota ? `Nota antejardín: ${z.antejardín_nota}` : null,
    z.profundidad_maxima_pct_deslinde != null ? `Profundidad máxima edificación: ${z.profundidad_maxima_pct_deslinde}% del deslinde` : null,
    z.adosamientos ? `Adosamientos: ${z.adosamientos}` : null,
    z.rasante_referencia ? `Rasante: ${z.rasante_referencia}` : null,
    z.articulo ? `Artículo PRC Providencia: ${z.articulo}` : null,
  ].filter(Boolean);

  chunks.push({
    fuente: 'PRC-PRV', codigo: `PRC-PRV-ZONA-${zonaId}`,
    titulo: `PRC Providencia — Zona ${zonaId} — Normas de edificación`,
    texto: lineas.join('\n'),
    metadata: { tipo: 'normas_edificacion', zona: zonaId, comuna: 'Providencia' },
  });
}
console.log(`  Normas edificación: ${Object.keys(normas).filter(k => !k.startsWith('_')).length} zonas`);

// 3. Usos de suelo por zona
const usos = JSON.parse(readFileSync(join(__dir, 'providencia/usos_suelo.json'), 'utf-8'));
for (const [zonaId, z] of Object.entries(usos.zonas || {})) {
  const lineas = [`Zona ${zonaId} — Usos de suelo permitidos en PRC Providencia`];
  if (z.usos_permitidos?.length) lineas.push('Usos permitidos: ' + z.usos_permitidos.join(', '));
  if (z.usos_prohibidos?.length) lineas.push('Usos prohibidos: ' + z.usos_prohibidos.join(', '));
  if (z.nota) lineas.push('Nota: ' + z.nota);
  if (lineas.length < 2) continue;
  chunks.push({
    fuente: 'PRC-PRV', codigo: `PRC-PRV-USOS-${zonaId}`,
    titulo: `PRC Providencia — Zona ${zonaId} — Usos de suelo`,
    texto: lineas.join('\n'),
    metadata: { tipo: 'usos_suelo', zona: zonaId, comuna: 'Providencia' },
  });
}
console.log(`  Usos de suelo: ${Object.keys(usos.zonas || {}).length} zonas`);

// 4. Patrimonio — agrupar en un solo chunk por ZEP
const patData = JSON.parse(readFileSync(join(__dir, 'providencia/patrimonio.json'), 'utf-8'));
const patItems = Object.values(patData);
const porZep = new Map();
for (const item of patItems) {
  const zep = item.zep || 'Sin-ZEP';
  if (!porZep.has(zep)) porZep.set(zep, []);
  porZep.get(zep).push(item);
}
for (const [zep, items] of porZep.entries()) {
  const lineas = [`Zona de Protección de Patrimonio ${zep} — PRC Providencia`];
  items.forEach(it => {
    lineas.push(`• ${it.tipo || 'Inmueble'}: ${it.nombre} (${it.ubicacion || ''})`);
  });
  chunks.push({
    fuente: 'PRC-PRV', codigo: `PRC-PRV-PAT-${zep}`,
    titulo: `PRC Providencia — Patrimonio ZEP ${zep}`,
    texto: lineas.join('\n').substring(0, 6500),
    metadata: { tipo: 'patrimonio', zep, comuna: 'Providencia' },
  });
}
console.log(`  Patrimonio: ${porZep.size} grupos ZEP`);

// ── Indexar ────────────────────────────────────────────────────────────────────
console.log(`\nIndexando ${chunks.length} chunks PRC-PRV...`);
for (let i = 0; i < chunks.length; i += 50) {
  const lote = chunks.slice(i, i + 50);
  const emb = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: lote.map(c => `${c.titulo}\n${c.texto}`.substring(0, 8000)) }),
  });
  const embJson = await emb.json();
  if (embJson.error) { console.error(embJson.error); process.exit(1); }
  const filas = lote.map((c, j) => ({ ...c, embedding: embJson.data[j].embedding }));
  const up = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?on_conflict=codigo`, {
    method: 'POST', headers: { ...HDR, 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(filas),
  });
  if (!up.ok) console.error(`Lote ${i}:`, await up.text());
  else process.stdout.write(`  ${Math.min(i + 50, chunks.length)}/${chunks.length}\r`);
}
console.log(`\nPRC Providencia indexado. ${chunks.length} chunks.`);

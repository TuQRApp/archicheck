/**
 * Tests de integración — ArchiCheck Worker producción.
 * Checks robustos (no-deterministas): verifican presencia de citas reales,
 * ausencia de hallucinations y comportamiento correcto del RAG.
 */
const WORKER = 'https://laude.nestragues.workers.dev';

async function collectStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        const t = evt.delta?.text ?? evt.choices?.[0]?.delta?.content ?? '';
        if (t) text += t;
      } catch (_) {}
    }
  }
  return text;
}

async function callWorker(modelo, content, ragQuery = null) {
  const body = { modelo, messages: [{ role: 'user', content }] };
  if (ragQuery) body.ragQuery = ragQuery;
  const resp = await fetch(WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return collectStream(resp);
}

function allCitas(text) {
  return [...new Set((text.match(/\[[A-Z][^\]\n]{2,35}\]/g) || []))];
}

function hasCita(text, prefix) {
  return new RegExp(`\\[${prefix}`).test(text);
}

const BASE = `Eres revisor DOM de Chile experto en LGUC, OGUC, circulares DDU del MINVU y Plan Regulador Comunal.
Analiza el caso y cita siempre la normativa usando códigos entre corchetes, ej: [OGUC-4.2.4], [LGUC-116], [DDU 447].`;

const TESTS = [
  {
    nombre: '1. Claude — PRC Providencia EC3',
    modelo: 'claude',
    ragQuery: 'coeficiente constructibilidad altura máxima zona EC3 Providencia',
    query: BASE + '\n\nPROYECTO: Edificio en Providencia zona EC3. Indica coeficiente de constructibilidad y altura máxima.',
    checks: [
      { desc: 'Menciona EC3',                        pass: t => t.includes('EC3') },
      { desc: 'Menciona coeficiente/constructib',    pass: t => /constructib|coeficiente/i.test(t) },
      { desc: 'Cita PRC o menciona Providencia PRC', pass: t => hasCita(t, 'PRC') || /Plan Regulador.*Providencia|PRC.*Providencia/i.test(t) },
      { desc: 'No expone código interno DDU-XXX-sN', pass: t => !/DDU-\d+-s\d/.test(t) },
    ],
  },
  {
    nombre: '2. Claude — OGUC ancho pasillo evacuación',
    modelo: 'claude',
    query: BASE + '\n\nPROBLEMA: El corredor de evacuación mide 1.05 m. ¿Cumple la normativa?',
    checks: [
      { desc: 'Cita OGUC-4.2.x',                   pass: t => hasCita(t, 'OGUC-4\\.2') },
      { desc: 'Menciona medida en metros',          pass: t => /1[.,]0\d?\s*m|metros|ancho mínimo/i.test(t) },
      { desc: 'No menciona PRC-PRV-ZONA',           pass: t => !t.includes('PRC-PRV-ZONA') },
    ],
  },
  {
    nombre: '3. Claude — DDU aportes espacio público',
    modelo: 'claude',
    query: BASE + '\n\nPROYECTO: Edificio 1.200 m² en Santiago. ¿Aplican aportes al espacio público? Cita la circular DDU pertinente.',
    checks: [
      { desc: 'Cita DDU 447',                        pass: t => /\[DDU 447/.test(t) },
      { desc: 'No expone código interno DDU-447-sN', pass: t => !/DDU-447-s\d/.test(t) },
      { desc: 'No expone código interno DDU-351-sN', pass: t => !/DDU-351-s\d/.test(t) },
    ],
  },
  {
    nombre: '4. Claude — Accesibilidad OGUC + DDU 351',
    modelo: 'claude',
    ragQuery: 'accesibilidad universal rampas ascensores discapacidad',
    query: BASE + '\n\nPROBLEMA: El proyecto no contempla rampas de acceso para personas con discapacidad.',
    checks: [
      { desc: 'Cita OGUC-4.1.7',                   pass: t => hasCita(t, 'OGUC-4\\.1\\.7') },
      { desc: 'Cita algún DDU de accesibilidad',      pass: t => /\[DDU \d/.test(t) },
      { desc: 'Menciona accesibilidad/rampa',       pass: t => /accesib|rampa|discapacidad/i.test(t) },
    ],
  },
  {
    nombre: '5. GPT-4o — PRC + OGUC',
    modelo: 'gpt4o',
    query: BASE + '\n\nPROYECTO: Edificio en Providencia zona EC3. Coeficiente de constructibilidad y restricciones de altura.',
    checks: [
      { desc: 'HTTP OK (GPT-4o path funciona)',     pass: t => t.length > 100 },
      { desc: 'Cita OGUC o PRC-PRV',                pass: t => hasCita(t, 'OGUC') || hasCita(t, 'PRC-PRV') },
      { desc: 'No inventa DDU inexistente',          pass: t => !(/\[DDU (?!172|176|186|200|201|157|912|1022|351|447)\d+\]/).test(t) },
    ],
  },
  {
    nombre: '6. Claude — LGUC permiso de edificación',
    modelo: 'claude',
    query: BASE + '\n\nPREGUNTA: ¿Qué documentos exige la DOM para otorgar un permiso de edificación?',
    checks: [
      { desc: 'Cita OGUC-5.1.x o LGUC-116',        pass: t => hasCita(t, 'OGUC-5\\.1') || hasCita(t, 'LGUC-116') },
      { desc: 'Menciona DOM/Dirección de Obras',    pass: t => /DOM|Dirección de Obras/i.test(t) },
    ],
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
console.log('='.repeat(65));
console.log('TEST SUITE — ArchiCheck Worker (producción)');
console.log(`Worker: ${WORKER}`);
console.log('='.repeat(65));

let totalPassed = 0, totalFailed = 0;

for (const test of TESTS) {
  console.log(`\n▶ ${test.nombre}`);
  let text = '';
  try {
    text = await callWorker(test.modelo, test.query, test.ragQuery || null);
    const citas = allCitas(text);
    console.log(`  Chars: ${text.length} | Citas: ${citas.slice(0, 6).join(' ')}`);
  } catch (err) {
    console.log(`  ✗ ERROR: ${err.message}`);
    test.checks.forEach(c => console.log(`  ✗ ${c.desc}`));
    totalFailed += test.checks.length;
    console.log('  → FAILED (error de red)');
    continue;
  }

  let testOk = true;
  for (const check of test.checks) {
    const pass = check.pass(text);
    console.log(`  ${pass ? '✓' : '✗'} ${check.desc}`);
    if (pass) totalPassed++; else { totalFailed++; testOk = false; }
  }
  console.log(`  → ${testOk ? 'PASSED' : 'FAILED'}`);
}

console.log(`\n${'='.repeat(65)}`);
const total = totalPassed + totalFailed;
console.log(`CHECKS: ${totalPassed}/${total} passed (${Math.round(totalPassed/total*100)}%)`);
console.log('='.repeat(65));

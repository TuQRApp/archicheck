/**
 * Tests de integración del worker en producción.
 * Verifica: respuesta, citas normativas, formato DDU, PRC.
 */

const WORKER = 'https://laude.nestragues.workers.dev';

const TESTS = [
  {
    name: 'Circulaciones y evacuación (OGUC Capítulo 4.2)',
    query: 'El pasillo de circulación mide 1.05 m de ancho. ¿Cumple la normativa chilena para un edificio de oficinas?',
    esperaCitar: ['OGUC-4.2', 'OGUC-4.1'],
    noEsperaCitar: [],
  },
  {
    name: 'PRC Providencia — zona y constructibilidad',
    query: 'Proyecto de edificio en Providencia, zona EC3. ¿Cuál es el coeficiente de constructibilidad máximo y la altura permitida?',
    esperaCitar: ['PRC-PRV', 'PRC'],
    noEsperaCitar: [],
  },
  {
    name: 'Permiso de edificación — documentos requeridos',
    query: '¿Qué documentos se necesitan para solicitar un permiso de edificación en la DOM?',
    esperaCitar: ['OGUC-5.1', 'LGUC'],
    noEsperaCitar: [],
  },
  {
    name: 'Accesibilidad universal',
    query: 'El proyecto no contempla rampa de acceso para personas con discapacidad. ¿Qué exige la normativa?',
    esperaCitar: ['OGUC-4.1.7', 'DDU'],
    noEsperaCitar: [],
  },
  {
    name: 'Formato citas DDU — no debe citar DDU-xxx-sN',
    query: 'Aportes al espacio público en proyecto de 800 m² de construcción en Santiago.',
    esperaCitar: ['DDU'],
    noEsperaCitar: ['DDU-447-s', 'DDU-351-s'],  // no deben aparecer códigos internos
  },
];

async function collectStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    // Extraer texto de SSE
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        const t = evt.delta?.text || evt.choices?.[0]?.delta?.content || '';
        text += t;
      } catch (_) {}
    }
  }
  return text;
}

console.log(`\n${'='.repeat(60)}`);
console.log('TEST SUITE — ArchiCheck Worker en producción');
console.log(`Worker: ${WORKER}`);
console.log(`${'='.repeat(60)}\n`);

let passed = 0, failed = 0;

for (const test of TESTS) {
  console.log(`\n▶ ${test.name}`);
  console.log(`  Query: "${test.query.substring(0, 80)}..."`);

  try {
    const resp = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelo: 'claude',
        messages: [{ role: 'user', content: test.query }],
      }),
    });

    if (!resp.ok) {
      console.log(`  ✗ HTTP ${resp.status}: ${await resp.text()}`);
      failed++;
      continue;
    }

    const text = await collectStream(resp);

    if (!text) {
      console.log('  ✗ Respuesta vacía');
      failed++;
      continue;
    }

    console.log(`  Respuesta (${text.length} chars): "${text.substring(0, 200).replace(/\n/g,' ')}..."`);

    // Verificar citas esperadas
    let testOk = true;
    for (const cita of test.esperaCitar) {
      if (text.includes(cita)) {
        console.log(`  ✓ Cita encontrada: ${cita}`);
      } else {
        console.log(`  ✗ Cita NO encontrada: ${cita}`);
        testOk = false;
      }
    }

    // Verificar que no aparezcan códigos internos
    for (const noCita of test.noEsperaCitar) {
      if (!text.includes(noCita)) {
        console.log(`  ✓ Código interno ausente (correcto): ${noCita}`);
      } else {
        console.log(`  ✗ Código interno expuesto (incorrecto): ${noCita}`);
        testOk = false;
      }
    }

    if (testOk) { passed++; console.log('  → PASSED'); }
    else         { failed++; console.log('  → FAILED'); }

  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`RESULTADO: ${passed} passed, ${failed} failed de ${TESTS.length} tests`);
console.log('='.repeat(60));

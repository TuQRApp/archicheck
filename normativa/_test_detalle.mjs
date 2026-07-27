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

const base = `Eres revisor DOM de Chile experto en LGUC, OGUC, circulares DDU del MINVU y Plan Regulador Comunal.
Analiza el siguiente caso y cita siempre la normativa aplicable usando códigos entre corchetes, ej: [OGUC-4.2.4], [LGUC-116], [DDU 447], [PRC-PRV-ZONA-EC3].`;

// Test PRC — buscar si menciona constructibilidad o coeficiente
const r1 = await fetch(WORKER, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ modelo: 'claude', messages: [{ role: 'user',
    content: base + '\n\nPROYECTO: Edificio mixto en Providencia, zona normativa EC3. Indica coeficiente de constructibilidad, altura máxima y agrupamiento permitido.' }] }),
});
const t1 = await collectStream(r1);
const has = s => t1.toLowerCase().includes(s.toLowerCase());
console.log('=== PRC EC3 ===');
console.log('constructibilidad:', has('constructibilidad'));
console.log('coeficiente:', has('coeficiente'));
console.log('altura:', has('altura'));
console.log('EC3:', has('EC3'));
const citas = t1.match(/\[[^\]]+\]/g) || [];
console.log('Todas las citas:', [...new Set(citas)].join(', '));
console.log('\nTexto completo:\n', t1);

// Test GPT-4o — buscar palabras relacionadas con accesibilidad
console.log('\n\n=== GPT-4o Accesibilidad ===');
const r2 = await fetch(WORKER, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ modelo: 'gpt4o', messages: [{ role: 'user',
    content: base + '\n\nPROBLEMA: El proyecto no contempla rampas accesibles. ¿Qué exige la normativa chilena?' }] }),
});
const t2 = await collectStream(r2);
const has2 = s => t2.toLowerCase().includes(s.toLowerCase());
console.log('discapacidad:', has2('discapacidad'));
console.log('accesible:', has2('accesible'));
console.log('rampa:', has2('rampa'));
console.log('OGUC-4.1.7:', has2('OGUC-4.1.7'));
console.log('DDU:', has2('DDU'));
const citas2 = t2.match(/\[[^\]]+\]/g) || [];
console.log('Todas las citas:', [...new Set(citas2)].join(', '));

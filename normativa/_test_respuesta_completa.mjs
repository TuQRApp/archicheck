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

// Test con la query PRC que RAG devuelve 25 chunks al 0.785+
const resp = await fetch(WORKER, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    modelo: 'claude',
    messages: [{ role: 'user', content: 'Proyecto de edificio en Providencia, zona EC3. ¿Cuál es el coeficiente de constructibilidad máximo y la altura permitida?' }],
  }),
});

console.log('HTTP status:', resp.status);
const text = await collectStream(resp);
console.log('\n--- RESPUESTA COMPLETA ---');
console.log(text);
console.log('\n--- ANÁLISIS ---');
console.log('Contiene [PRC:', text.includes('[PRC'));
console.log('Contiene [OGUC:', text.includes('[OGUC'));
console.log('Contiene PRC-PRV:', text.includes('PRC-PRV'));
console.log('Contiene EC3:', text.includes('EC3'));
console.log('Contiene constructibilidad:', text.includes('constructibilidad'));

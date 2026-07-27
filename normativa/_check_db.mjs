const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` };

// Total rows
const r1 = await fetch(`${URL}/rest/v1/normativa_chunks?select=id`, { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
console.log('Total rows:', r1.headers.get('content-range'));

// Rows con embedding not null
const r2 = await fetch(`${URL}/rest/v1/normativa_chunks?embedding=not.is.null&select=id`, { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-0' } });
console.log('Rows con embedding:', r2.headers.get('content-range'));

// Muestra raw de una fila
const r3 = await fetch(`${URL}/rest/v1/normativa_chunks?limit=1&select=codigo,fuente,embedding`, { headers: H });
const d = await r3.json();
if (d[0]) {
  console.log('Fila muestra:', d[0].codigo, '| tipo:', typeof d[0].embedding, '| valor:', String(d[0].embedding).substring(0, 80));
}

// Contar por fuente
const r4 = await fetch(`${URL}/rest/v1/normativa_chunks?select=fuente`, { headers: { ...H, 'Prefer': 'count=exact', 'Range': '0-4999' } });
const rows = await r4.json();
const cnt = {};
rows.forEach(x => cnt[x.fuente] = (cnt[x.fuente] || 0) + 1);
console.log('Por fuente (primera pag):', JSON.stringify(cnt));
console.log('Total en primera pag:', rows.length);

import { fileURLToPath } from 'url';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const HDR = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' };

const del = await fetch(`${SUPABASE_URL}/rest/v1/normativa_chunks?fuente=eq.DDU&codigo=like.DDU-%25-dup%25`, {
  method: 'DELETE', headers: HDR,
});
console.log('DELETE DDU dups status:', del.status, del.ok ? 'OK' : await del.text());

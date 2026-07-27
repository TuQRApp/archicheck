/**
 * Actualiza match_normativa en Supabase para usar ivfflat.probes = 10.
 * Mejora el recall del índice IVFFlat (busca en 10 clusters en vez de 1).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sql = `
CREATE OR REPLACE FUNCTION match_normativa(
  query_embedding vector(1536),
  match_count int DEFAULT 25,
  fuentes text[] DEFAULT NULL
)
RETURNS TABLE (id uuid, fuente text, codigo text, titulo text, texto text, metadata jsonb, similarity float)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  SET LOCAL ivfflat.probes = 10;
  RETURN QUERY
    SELECT
      nc.id, nc.fuente, nc.codigo, nc.titulo, nc.texto, nc.metadata,
      1 - (nc.embedding <=> query_embedding) AS similarity
    FROM normativa_chunks nc
    WHERE (fuentes IS NULL OR nc.fuente = ANY(fuentes))
      AND nc.embedding IS NOT NULL
    ORDER BY nc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
`;

const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

// Supabase no expone SQL directo vía REST — usar el endpoint de SQL
const resp2 = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  method: 'POST',
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
});

// Usar el endpoint correcto de Supabase para ejecutar SQL arbitrario
const pgResp = await fetch(`${SUPABASE_URL}/pg/sql`, {
  method: 'POST',
  headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});

console.log('Status:', pgResp.status);
const body = await pgResp.text();
console.log('Response:', body.substring(0, 300));

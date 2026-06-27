-- ============================================================
-- ArchiCheck — Supabase pgvector schema
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Habilitar extensión pgvector
create extension if not exists vector;

-- 2. Tabla principal
create table if not exists normativa_chunks (
  id          uuid primary key default gen_random_uuid(),
  fuente      text not null,   -- 'OGUC' | 'LGUC' | 'LEY19300' | 'DDU'
  codigo      text not null,   -- 'OGUC-2.1.24' | 'DDU-351-s1' | 'LGUC-116'
  titulo      text,
  texto       text not null,
  metadata    jsonb default '{}',
  embedding   vector(1536),
  updated_at  timestamptz default now()
);

-- 3. Índice único para upsert idempotente
create unique index if not exists normativa_chunks_codigo_idx
  on normativa_chunks (codigo);

-- 4. Índice IVFFlat — crear DESPUÉS de cargar todos los datos
--    Descomentar y ejecutar una sola vez cuando la tabla esté completa:
-- create index normativa_chunks_embedding_idx
--   on normativa_chunks using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

-- 5. Función de búsqueda semántica
--    Worker la llama vía: POST /rest/v1/rpc/match_normativa
create or replace function match_normativa(
  query_embedding  vector(1536),
  match_count      int     default 25,
  fuentes          text[]  default null
)
returns table (
  id          uuid,
  fuente      text,
  codigo      text,
  titulo      text,
  texto       text,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    id, fuente, codigo, titulo, texto, metadata,
    1 - (embedding <=> query_embedding) as similarity
  from normativa_chunks
  where (fuentes is null or fuente = any(fuentes))
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- 6. RLS: lectura pública (Worker usa anon key), escritura solo con service key
alter table normativa_chunks enable row level security;

create policy "Lectura publica" on normativa_chunks
  for select using (true);

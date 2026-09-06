-- Banheza Pool — schema do banco (Postgres/Supabase)
-- Como rodar: Supabase Dashboard → seu projeto → SQL Editor → cole este arquivo inteiro → Run.
-- Pode rodar mais de uma vez sem problema (os "if not exists"/"or replace" tornam idempotente).

-- ── extensão para gen_random_uuid() ──────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── clientes ──────────────────────────────────────────────────────────────
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  telefone text,
  email text,
  endereco text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ── piscinas (cada piscina pertence a um cliente) ────────────────────────────
create table if not exists public.piscinas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  sistema_desinfeccao text not null default 'manual',
  sal_min numeric,
  sal_max numeric,
  formato text not null default 'retangular',
  unidade text not null default 'm',
  modo_prof text not null default 'unica',
  prof numeric,
  prof_min numeric,
  prof_max numeric,
  formas jsonb not null default '[]'::jsonb,
  litros numeric not null,
  aproximado boolean not null default false,
  litros_manuais numeric,
  created_at timestamptz not null default now()
);

-- ── produtos (catálogo próprio de cada usuário) ──────────────────────────────
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null,
  nome_comercial text not null,
  marca text,
  principio_ativo text,
  concentracao numeric not null,
  estado_fisico text not null default 'solido',
  densidade numeric,
  preco numeric,
  fonte text,
  created_at timestamptz not null default now()
);

-- ── histórico de diagnósticos ─────────────────────────────────────────────
create table if not exists public.historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  piscina_id uuid not null references public.piscinas (id) on delete cascade,
  data timestamptz not null default now(),
  leituras jsonb not null default '{}'::jsonb,
  passos jsonb not null default '[]'::jsonb
);

-- ── consumos (produtos realmente aplicados, alimenta o relatório de custos) ──
create table if not exists public.consumos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  piscina_id uuid not null references public.piscinas (id) on delete cascade,
  produto_id uuid references public.produtos (id) on delete set null,
  produto_nome text not null,
  quantidade numeric not null,
  unidade text not null,
  diagnostico_id uuid references public.historico (id) on delete set null,
  data timestamptz not null default now()
);

-- ── índices (consultas mais comuns: listar por dono, piscinas por cliente,
--    histórico/consumos por piscina) ──────────────────────────────────────
create index if not exists idx_clientes_user on public.clientes (user_id);
create index if not exists idx_piscinas_user on public.piscinas (user_id);
create index if not exists idx_piscinas_cliente on public.piscinas (cliente_id);
create index if not exists idx_produtos_user on public.produtos (user_id);
create index if not exists idx_historico_user on public.historico (user_id);
create index if not exists idx_historico_piscina on public.historico (piscina_id);
create index if not exists idx_consumos_user on public.consumos (user_id);
create index if not exists idx_consumos_piscina on public.consumos (piscina_id);

-- ── Row Level Security: cada usuário só enxerga/mexe nas próprias linhas ────
-- (é isso que garante "cada piscineiro só vê os próprios clientes" sem
-- precisar de nenhuma regra de autorização escrita no front-end)
alter table public.clientes enable row level security;
alter table public.piscinas enable row level security;
alter table public.produtos enable row level security;
alter table public.historico enable row level security;
alter table public.consumos enable row level security;

drop policy if exists "clientes_own_rows" on public.clientes;
create policy "clientes_own_rows" on public.clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "piscinas_own_rows" on public.piscinas;
create policy "piscinas_own_rows" on public.piscinas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "produtos_own_rows" on public.produtos;
create policy "produtos_own_rows" on public.produtos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "historico_own_rows" on public.historico;
create policy "historico_own_rows" on public.historico
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "consumos_own_rows" on public.consumos;
create policy "consumos_own_rows" on public.consumos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

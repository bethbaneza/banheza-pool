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
  proxima_visita date,
  created_at timestamptz not null default now()
);
-- Se a tabela já existir de uma versão anterior do schema, garante a coluna sem recriar nada:
alter table public.piscinas add column if not exists proxima_visita date;

-- ── perfis (dados cadastrais do piscineiro + plano de assinatura) ────────────
-- Uma linha por usuário (id = auth.users.id, não um uuid próprio) — os dados aqui servem só
-- pra identificação/endereço de cobrança; a emissão de nota fiscal em si acontece fora do app.
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  tipo_pessoa text not null default 'fisica', -- 'fisica' | 'juridica'
  nome_razao_social text,
  cpf_cnpj text,
  telefone text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  plano text not null default 'gratis', -- 'gratis' | 'basico' | 'ilimitado'
  status_assinatura text, -- null (gratis) | 'ativa' | 'atrasada' | 'cancelada'
  mp_preapproval_id text, -- id da assinatura no Mercado Pago, quando existir
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.perfis enable row level security;
drop policy if exists "perfis_own_row" on public.perfis;
create policy "perfis_own_row" on public.perfis
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- ── limites de plano — aplicados aqui no banco (não só na interface), pra não dar pra
--    contornar o paywall chamando a API do Supabase direto com a anon key ───────────────
-- Grátis: 1 cliente, 1 piscina por cliente. Básico (R$19,90): até 5 clientes, 1 piscina por
-- cliente. Ilimitado (R$49,90): sem limite de clientes nem de piscinas.
create or replace function public.limite_clientes_do_plano(p_plano text)
returns integer language sql immutable as $$
  select case p_plano
    when 'basico' then 5
    when 'ilimitado' then null
    else 1 -- gratis (e qualquer plano desconhecido, por segurança)
  end;
$$;

create or replace function public.limite_piscinas_por_cliente_do_plano(p_plano text)
returns integer language sql immutable as $$
  select case p_plano
    when 'ilimitado' then null
    else 1 -- gratis e basico
  end;
$$;

create or replace function public.checar_limite_clientes()
returns trigger language plpgsql as $$
declare
  v_limite integer;
  v_atual integer;
begin
  select public.limite_clientes_do_plano(coalesce((select plano from public.perfis where id = new.user_id), 'gratis'))
    into v_limite;
  if v_limite is not null then
    select count(*) into v_atual from public.clientes where user_id = new.user_id;
    if v_atual >= v_limite then
      raise exception 'LIMITE_CLIENTES_ATINGIDO' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checar_limite_clientes on public.clientes;
create trigger trg_checar_limite_clientes
  before insert on public.clientes
  for each row execute function public.checar_limite_clientes();

create or replace function public.checar_limite_piscinas()
returns trigger language plpgsql as $$
declare
  v_limite integer;
  v_atual integer;
begin
  select public.limite_piscinas_por_cliente_do_plano(coalesce((select plano from public.perfis where id = new.user_id), 'gratis'))
    into v_limite;
  if v_limite is not null then
    select count(*) into v_atual from public.piscinas where user_id = new.user_id and cliente_id = new.cliente_id;
    if v_atual >= v_limite then
      raise exception 'LIMITE_PISCINAS_ATINGIDO' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_checar_limite_piscinas on public.piscinas;
create trigger trg_checar_limite_piscinas
  before insert on public.piscinas
  for each row execute function public.checar_limite_piscinas();

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

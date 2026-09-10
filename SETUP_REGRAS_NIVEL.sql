-- ============================================================
-- WHEEL TECH  ·  Regras de nível de estoque  (escada de preços)
-- ------------------------------------------------------------
-- Rode este arquivo INTEIRO no Supabase -> SQL Editor.
-- É aditivo / idempotente: pode rodar de novo sem problema.
--
--   regras_nivel_estoque   -> a regra (escopo + escada de degraus)
--   regras_nivel_disparos  -> estado por (regra, produto): nível
--                             atual, preços originais e log da ação.
--                             Também é a "notificação" pros admins.
-- ============================================================

-- 1) REGRAS -------------------------------------------------
create table if not exists public.regras_nivel_estoque (
    id uuid primary key default gen_random_uuid()
);

alter table public.regras_nivel_estoque add column if not exists nome               text;
alter table public.regras_nivel_estoque add column if not exists ativo              boolean not null default true;
alter table public.regras_nivel_estoque add column if not exists escopo_categoria   text;
alter table public.regras_nivel_estoque add column if not exists escopo_termo       text;      -- texto da busca
alter table public.regras_nivel_estoque add column if not exists escopo_produto_ids jsonb;     -- ["1712", ...] quando marcado na tabela
alter table public.regras_nivel_estoque add column if not exists escopo_custo_op    text;
alter table public.regras_nivel_estoque add column if not exists escopo_custo_valor numeric;
alter table public.regras_nivel_estoque add column if not exists escopo_qtd_op      text;
alter table public.regras_nivel_estoque add column if not exists escopo_qtd_valor   numeric;
alter table public.regras_nivel_estoque add column if not exists gatilho_qtd        integer not null default 5;
-- escada: [{ "nivel": 11, "modo": "pct", "valor": 5 }, ...]  (do gatilho até 1)
alter table public.regras_nivel_estoque add column if not exists escada             jsonb not null default '[]'::jsonb;
alter table public.regras_nivel_estoque add column if not exists criado_por         text;
alter table public.regras_nivel_estoque add column if not exists criado_em          timestamptz not null default now();
alter table public.regras_nivel_estoque add column if not exists atualizado_em      timestamptz not null default now();

-- colunas da versão antiga (mantidas caso já existam; não são mais usadas)
alter table public.regras_nivel_estoque add column if not exists acao_tipo  text;
alter table public.regras_nivel_estoque add column if not exists acao_sinal text;
alter table public.regras_nivel_estoque add column if not exists acao_valor numeric;

-- 2) ESTADO / DISPAROS ------------------------------------
create table if not exists public.regras_nivel_disparos (
    id uuid primary key default gen_random_uuid()
);

alter table public.regras_nivel_disparos add column if not exists regra_id           uuid;
alter table public.regras_nivel_disparos add column if not exists produto_id         text;
alter table public.regras_nivel_disparos add column if not exists produto_sku        text;
alter table public.regras_nivel_disparos add column if not exists produto_nome       text;
alter table public.regras_nivel_disparos add column if not exists estoque_no_disparo integer;
alter table public.regras_nivel_disparos add column if not exists nivel_atual        integer;
alter table public.regras_nivel_disparos add column if not exists acao_descricao     text;
-- precos_base: { "<mlb>": 248.49, ... }  (preço de antes da regra pegar)
alter table public.regras_nivel_disparos add column if not exists precos_base        jsonb not null default '{}'::jsonb;
-- mlbs: [{ mlb, preco_antigo, preco_novo, ok, erro, nota }]  (última ação)
alter table public.regras_nivel_disparos add column if not exists mlbs               jsonb not null default '[]'::jsonb;
alter table public.regras_nivel_disparos add column if not exists visto              boolean not null default false;
alter table public.regras_nivel_disparos add column if not exists disparado_em       timestamptz not null default now();
alter table public.regras_nivel_disparos add column if not exists atualizado_em      timestamptz not null default now();

create unique index if not exists regras_nivel_disparos_uidx
    on public.regras_nivel_disparos (regra_id, produto_id);
create index if not exists regras_nivel_disparos_visto_idx
    on public.regras_nivel_disparos (visto);

-- 3) PERMISSÕES / RLS -------------------------------------
grant select, insert, update, delete on public.regras_nivel_estoque  to anon, authenticated;
grant select, insert, update, delete on public.regras_nivel_disparos to anon, authenticated;

alter table public.regras_nivel_estoque  enable row level security;
alter table public.regras_nivel_disparos enable row level security;

drop policy if exists rne_all on public.regras_nivel_estoque;
create policy rne_all on public.regras_nivel_estoque for all using (true) with check (true);

drop policy if exists rnd_all on public.regras_nivel_disparos;
create policy rnd_all on public.regras_nivel_disparos for all using (true) with check (true);

-- PRONTO.

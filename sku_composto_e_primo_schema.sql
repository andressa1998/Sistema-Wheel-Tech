-- SKU Composto, SKU Primo (substituto) e alerta de última unidade — Wheel Tech
--
-- Isso é ADITIVO: não mexe em nada do que já existe (produto_skus_kit
-- continua aí do jeito que estava, o fluxo manual de kit por venda em
-- vendas_ml.eh_kit/skus_kit continua funcionando exatamente igual).
--
-- SKU COMPOSTO reaproveita a tabela produto_skus_kit (sku_pai,
-- sku_filho, quantidade) que já existe e já tem CRUD funcionando no
-- cadastro de produto — só adiciona a marcação explícita de "isto é
-- um SKU composto" e um nome alternativo pra aparecer na NF-e.

alter table produtos_estoque
    add column if not exists eh_sku_composto boolean not null default false,
    add column if not exists nome_composto_nfe text;

create index if not exists idx_produtos_estoque_eh_sku_composto
    on produtos_estoque(eh_sku_composto)
    where eh_sku_composto = true;

-- ============================================================
-- SKU PRIMO — substitutos que o sistema pode usar quando o SKU
-- principal esgota o estoque.
-- ============================================================

create table if not exists produto_skus_primos (
    id bigserial primary key,
    sku_principal text not null,
    sku_primo text not null,
    criado_por text,
    criado_em timestamptz not null default now(),
    unique (sku_principal, sku_primo)
);

create index if not exists idx_skus_primos_principal on produto_skus_primos(sku_principal);

-- Registra qual substituição está ativa agora (pra saber reverter
-- quando o principal voltar a ter estoque).
create table if not exists produto_substituicoes_ativas (
    id bigserial primary key,
    sku_principal text not null unique,
    sku_primo_ativo text not null,
    mlb_codes jsonb not null default '[]'::jsonb,
    sku_original_nos_anuncios text,
    ativado_por text,
    ativado_em timestamptz not null default now(),
    revertido_em timestamptz
);

-- ============================================================
-- ALERTA: peça de um SKU composto chegou a 1 unidade em estoque.
-- ============================================================

create table if not exists produto_alertas_ultima_unidade (
    id bigserial primary key,
    sku text not null,
    sku_pai_composto text not null,
    status text not null default 'pendente', -- pendente | manter_individual | somente_kit
    decidido_por text,
    decidido_em timestamptz,
    criado_em timestamptz not null default now(),
    unique (sku, sku_pai_composto, status)
);

create index if not exists idx_alertas_ultima_unidade_status on produto_alertas_ultima_unidade(status);

alter table produto_skus_primos enable row level security;
alter table produto_substituicoes_ativas enable row level security;
alter table produto_alertas_ultima_unidade enable row level security;

drop policy if exists "produto_skus_primos_all" on produto_skus_primos;
create policy "produto_skus_primos_all" on produto_skus_primos for all using (true) with check (true);

drop policy if exists "produto_substituicoes_ativas_all" on produto_substituicoes_ativas;
create policy "produto_substituicoes_ativas_all" on produto_substituicoes_ativas for all using (true) with check (true);

drop policy if exists "produto_alertas_ultima_unidade_all" on produto_alertas_ultima_unidade;
create policy "produto_alertas_ultima_unidade_all" on produto_alertas_ultima_unidade for all using (true) with check (true);

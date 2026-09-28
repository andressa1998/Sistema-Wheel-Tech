-- Acompanhamento de reputação nas Reclamações de Clientes (a tela
-- que sincroniza com a API de claims/mediações do Mercado Livre):
-- se afeta a reputação, se o erro é nosso, solução dada, custo
-- gerado, e os envios de correio feitos por causa da reclamação.
-- "Quem está cuidando" já existe (coluna responsavel).

alter table reclamacoes_clientes
    add column if not exists afeta_reputacao boolean not null default false,
    add column if not exists erro_nosso boolean,
    add column if not exists resolvido_externo boolean,
    add column if not exists solucao_externa text,
    add column if not exists demos_solucao boolean,
    add column if not exists solucao_interna text,
    add column if not exists custo numeric,
    add column if not exists data_resolucao timestamptz;

create index if not exists idx_reclamacoes_clientes_afeta_reputacao
    on reclamacoes_clientes (afeta_reputacao)
    where afeta_reputacao = true;

create table if not exists reclamacoes_clientes_envios_correio (
    id bigint generated always as identity primary key,
    reclamacao_id bigint not null references reclamacoes_clientes(id) on delete cascade,
    erro text,
    produto_id bigint references produtos_estoque(id) on delete set null,
    produto_sku text,
    produto_nome text,
    codigo_rastreio text,
    tipo_embalagem text,
    nome_cliente text,
    data_postagem date,
    valor_frete numeric,
    criado_por text,
    criado_em timestamptz not null default now()
);

create index if not exists idx_rc_envios_correio_reclamacao
    on reclamacoes_clientes_envios_correio (reclamacao_id);

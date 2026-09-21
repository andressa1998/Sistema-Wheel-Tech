-- Autorização obrigatória para ajustes manuais de estoque em Gestão
-- de Estoque (edição direta do campo Quantidade, e "Movimentar >
-- Ajuste de estoque"). A alteração é aplicada na hora; se for
-- recusada, o estoque volta pro valor anterior.

create table if not exists estoque_correcoes_autorizacao (
    id bigserial primary key,
    produto_id integer not null,
    produto_sku text,
    produto_nome text,
    origem text not null check (origem in ('edicao_produto', 'movimentacao_ajuste')),
    quantidade_anterior integer not null,
    quantidade_nova integer not null,
    solicitado_por text not null,
    solicitado_em timestamptz not null default now(),
    status text not null default 'pendente' check (status in ('pendente', 'autorizada', 'recusada')),
    autorizado_por text,
    autorizado_em timestamptz,
    motivo_recusa text,
    ignoradas jsonb not null default '{}'::jsonb
);

create index if not exists idx_estoque_correcoes_status on estoque_correcoes_autorizacao (status);
create index if not exists idx_estoque_correcoes_produto on estoque_correcoes_autorizacao (produto_id);

-- Histórico de baixas FULL passa a ficar no banco (antes ficava só no navegador de quem processou).
create table if not exists historico_baixas_full (
    documento_movimentacao text primary key,
    dados jsonb not null,
    atualizado_em timestamptz not null default now()
);

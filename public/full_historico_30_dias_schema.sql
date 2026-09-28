-- Histórico de quem entra/sai da lista "30+ dias sem vender" no FULL.
-- Uma linha aberta (data_saida null) = ainda está parado na lista.

create table if not exists full_historico_30_mais_dias (
    id bigint generated always as identity primary key,
    item_id text not null,
    variation_id text,
    sku text,
    titulo text,
    data_entrada timestamptz not null default now(),
    data_saida timestamptz,
    motivo_saida text,
    dias_parado_na_entrada integer,
    criado_em timestamptz not null default now()
);

create index if not exists idx_full_historico_30_aberto
    on full_historico_30_mais_dias (item_id, variation_id)
    where data_saida is null;

create index if not exists idx_full_historico_30_item
    on full_historico_30_mais_dias (item_id, variation_id);

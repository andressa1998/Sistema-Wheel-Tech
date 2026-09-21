-- Exposição (Clássico/Premium) automática por preço de promoção.
--
-- Quando uma promoção derruba o preço de um anúncio Premium pra
-- menos de R$150, a exposição vira Clássico. Quando a promoção é
-- desativada e o preço volta pra R$150+, reverte pra Premium.
-- Regras fixas de clássico/premium (configuracoes_sistema,
-- chave='regras_fixas_tipo_anuncio_ml') sempre têm prioridade sobre
-- isso.

create table if not exists produto_exposicao_promocao_ativa (
    id bigserial primary key,
    mlb text not null unique,
    sku text,
    listing_type_original text not null,
    listing_type_atual text not null,
    preco_no_momento numeric,
    motivo text not null default 'promocao_abaixo_150',
    ativado_em timestamptz not null default now(),
    revertido_em timestamptz
);

create index if not exists idx_exposicao_promocao_ativa_pendente
    on produto_exposicao_promocao_ativa(mlb)
    where revertido_em is null;

alter table produto_exposicao_promocao_ativa enable row level security;

drop policy if exists "produto_exposicao_promocao_ativa_all" on produto_exposicao_promocao_ativa;
create policy "produto_exposicao_promocao_ativa_all" on produto_exposicao_promocao_ativa for all using (true) with check (true);

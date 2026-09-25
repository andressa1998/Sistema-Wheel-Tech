-- Regras de nível de estoque: antes de mudar o preço de um anúncio que
-- está em promoção ativa no Mercado Livre, o sistema para e deixa pendente
-- de decisão do admin (mesmo padrão já usado pro "estoque reposto").
alter table regras_nivel_disparos
    add column if not exists promocao_pendente boolean not null default false,
    add column if not exists promocao_nivel_recomendado integer,
    add column if not exists promocao_precos jsonb,
    add column if not exists promocao_info jsonb,
    add column if not exists promocao_detectado_em timestamptz;

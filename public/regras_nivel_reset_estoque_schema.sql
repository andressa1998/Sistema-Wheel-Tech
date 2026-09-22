-- Regras de nível de estoque: quando o estoque de um produto que está
-- com preço reajustado (por baixo estoque) AUMENTA — seja por entrada,
-- movimentação manual ou edição direta — o sistema não muda o preço
-- sozinho. Ele calcula o preço recomendado pela escada (ou o preço
-- original, se saiu da faixa de gatilho) e deixa pendente de
-- confirmação do admin.

alter table regras_nivel_disparos add column if not exists reset_pendente boolean not null default false;
alter table regras_nivel_disparos add column if not exists reset_nivel_recomendado integer;
alter table regras_nivel_disparos add column if not exists reset_precos jsonb;
alter table regras_nivel_disparos add column if not exists reset_estoque_novo integer;
alter table regras_nivel_disparos add column if not exists reset_detectado_em timestamptz;

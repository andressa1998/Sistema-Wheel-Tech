-- Regras de nível de estoque: salva a referência de preço no
-- momento em que a REGRA é criada, em vez de pegar o preço "atual"
-- do anúncio só quando o disparo acontece de verdade (o que fazia
-- o preço-base variar dependendo de quando o estoque cruzava o
-- nível, e não bater com o "Preço (ref.)" mostrado na tela ao
-- montar a regra).

alter table regras_nivel_estoque
    add column if not exists precos_base jsonb not null default '{}'::jsonb;

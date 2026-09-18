-- SKU Composto: tabela própria para as peças que compõem o produto.
--
-- Isso é uma CORREÇÃO: a primeira versão do SKU Composto reaproveitou
-- por engano a tabela produto_skus_kit (que é do esquema de SKU
-- Filho/variação no Mercado Livre — pai e filho aparecem juntos na
-- variação do anúncio, e não tem nada a ver com SKU Composto). São
-- dois esquemas completamente separados:
--
--   SKU FILHO (produto_skus_kit, já existia antes, mantido intacto):
--     sku_pai e sku_filho aparecem JUNTOS no anúncio, em variações.
--
--   SKU COMPOSTO (esta tabela nova):
--     lista de SKUs que fisicamente compõem o produto. Esses SKUs
--     NÃO aparecem no anúncio — no anúncio só aparece o SKU do
--     produto composto (o "pai"). A baixa/entrada acontece nas
--     peças, mas o anúncio em si é só do composto.

create table if not exists produto_sku_composto_partes (
    id bigserial primary key,
    sku_composto text not null,
    sku_parte text not null,
    quantidade integer not null default 1,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    unique (sku_composto, sku_parte)
);

create index if not exists idx_sku_composto_partes_composto
    on produto_sku_composto_partes(sku_composto);

alter table produto_sku_composto_partes enable row level security;

drop policy if exists "produto_sku_composto_partes_all" on produto_sku_composto_partes;
create policy "produto_sku_composto_partes_all" on produto_sku_composto_partes for all using (true) with check (true);

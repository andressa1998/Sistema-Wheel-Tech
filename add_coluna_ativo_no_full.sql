-- ============================================================
-- ADICIONA A COLUNA ativo_no_full NA TABELA gerenciamento_anuncios_ml
--
-- Usada pelo Gerenciamento de Anúncios para saber se o anúncio
-- está mesmo ativo no FULL (logística "fulfillment") no momento
-- do último sync — usada no alerta "Ativo no FULL com estoque
-- parado" (quando o depósito passa de 2 unidades).
--
-- Rode este script manualmente no SQL Editor do Supabase.
-- ============================================================

alter table gerenciamento_anuncios_ml
    add column if not exists ativo_no_full boolean;

-- ============================================================
-- CORRIGE A CONSTRAINT DE STATUS DA TABELA entrada_items
--
-- O botão "Ignorar" (aba Entradas) tenta salvar status = 'ignorado'
-- em entrada_items, mas a constraint atual (entrada_items_status_check)
-- não permite esse valor, causando o erro:
--
--   "new row for relation "entrada_items" violates check
--    constraint "entrada_items_status_check""
--
-- O código do sistema usa estes 4 valores para entrada_items.status:
-- 'pendente', 'entrada_realizada', 'cadastrado', 'ignorado'.
--
-- Rode este script manualmente no SQL Editor do Supabase.
-- ============================================================

alter table entrada_items
    drop constraint if exists entrada_items_status_check;

alter table entrada_items
    add constraint entrada_items_status_check
    check (status in ('pendente', 'entrada_realizada', 'cadastrado', 'ignorado'));

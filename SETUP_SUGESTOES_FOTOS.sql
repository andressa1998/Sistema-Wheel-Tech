-- ============================================================
-- SUGESTÕES DE MELHORIA — permissão pra salvar as fotos
--
-- O bucket "sugestoes" existe e é público, mas não tinha política
-- de envio (INSERT) em storage.objects, então todo upload de foto
-- dava "new row violates row-level security policy".
-- O sistema usa a chave anon (login próprio, não o Auth do
-- Supabase), por isso a política vale pra anon e authenticated —
-- igual ao bucket "chamados", que já funciona.
--
-- Rodar uma vez no Supabase: SQL Editor -> colar -> Run.
-- ============================================================

drop policy if exists "sugestoes_fotos_envio" on storage.objects;
create policy "sugestoes_fotos_envio"
    on storage.objects
    for insert
    to anon, authenticated
    with check (bucket_id = 'sugestoes');

drop policy if exists "sugestoes_fotos_leitura" on storage.objects;
create policy "sugestoes_fotos_leitura"
    on storage.objects
    for select
    to anon, authenticated
    using (bucket_id = 'sugestoes');

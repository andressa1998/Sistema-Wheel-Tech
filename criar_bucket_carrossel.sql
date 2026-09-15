-- ============================================================
-- CRIA O BUCKET "carrossel" NO SUPABASE STORAGE
--
-- Usado pelo editor de carrossel (menu > engrenagem > Editar
-- carrossel) para guardar as imagens dos slides.
--
-- Rode este script no SQL Editor do Supabase (não precisa mexer
-- na tela de Storage manualmente).
-- ============================================================

-- Cria o bucket como PÚBLICO (necessário para as imagens
-- aparecerem no carrossel sem precisar de link assinado).
insert into storage.buckets (id, name, public)
values ('carrossel', 'carrossel', true)
on conflict (id) do nothing;


-- Permite que qualquer um LEIA os arquivos deste bucket
-- (necessário para a imagem carregar na tela inicial).
drop policy if exists "Leitura publica do carrossel" on storage.objects;

create policy "Leitura publica do carrossel"
on storage.objects for select
using (bucket_id = 'carrossel');


-- Permite que o sistema ENVIE novas imagens (o app usa a chave
-- anônima do Supabase, sem login via Supabase Auth, então a
-- política precisa valer para todo mundo — mesmo padrão já usado
-- nas outras tabelas deste sistema).
drop policy if exists "Upload no carrossel" on storage.objects;

create policy "Upload no carrossel"
on storage.objects for insert
with check (bucket_id = 'carrossel');


-- Permite SUBSTITUIR uma imagem existente (upsert).
drop policy if exists "Atualizar no carrossel" on storage.objects;

create policy "Atualizar no carrossel"
on storage.objects for update
using (bucket_id = 'carrossel');


-- Permite EXCLUIR uma imagem (caso um dia seja preciso limpar
-- arquivos antigos do bucket).
drop policy if exists "Excluir no carrossel" on storage.objects;

create policy "Excluir no carrossel"
on storage.objects for delete
using (bucket_id = 'carrossel');

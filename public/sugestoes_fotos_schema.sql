-- Fotos de exemplo nas sugestões de melhoria (mais de uma por sugestão).

alter table feedback_sugestoes
    add column if not exists fotos jsonb;

-- Bucket público de Storage para as fotos das sugestões.
insert into storage.buckets (id, name, public)
values ('sugestoes', 'sugestoes', true)
on conflict (id) do nothing;

create policy if not exists "sugestoes_leitura_publica"
    on storage.objects for select
    using (bucket_id = 'sugestoes');

create policy if not exists "sugestoes_upload_publico"
    on storage.objects for insert
    with check (bucket_id = 'sugestoes');

create policy if not exists "sugestoes_update_publico"
    on storage.objects for update
    using (bucket_id = 'sugestoes');

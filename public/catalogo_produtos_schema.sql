-- Catálogo de Produtos (Gestão de Estoque)
-- Guarda só a URL da foto principal do Mercado Livre (pictures[0].secure_url),
-- não a imagem em si — sincroniza por categoria, sob demanda, pra não gastar
-- requisição com os quase 3 mil produtos toda vez.
create table if not exists catalogo_produtos (
    id bigint generated always as identity primary key,
    sku text not null,
    mlb text,
    titulo text,
    categoria text,
    subcategoria text,
    foto_url text,
    ativo boolean not null default true,
    ordem integer,
    atualizado_em timestamptz,
    criado_em timestamptz not null default now(),
    unique (sku)
);

create index if not exists idx_catalogo_produtos_categoria
    on catalogo_produtos (categoria)
    where ativo = true;


-- Bucket de storage pros PDFs gerados (link pra mandar pro cliente).
-- Primeira vez que este app usa Supabase Storage — bucket público
-- (leitura sem autenticação) porque o link é justamente pra compartilhar
-- com quem não tem login no sistema.
insert into storage.buckets (id, name, public)
values ('catalogos', 'catalogos', true)
on conflict (id) do nothing;

-- "create policy" não tem IF NOT EXISTS no Postgres — apaga e recria.
drop policy if exists "catalogos_leitura_publica" on storage.objects;
create policy "catalogos_leitura_publica"
    on storage.objects for select
    using (bucket_id = 'catalogos');

drop policy if exists "catalogos_upload_anon" on storage.objects;
create policy "catalogos_upload_anon"
    on storage.objects for insert
    to anon
    with check (bucket_id = 'catalogos');

drop policy if exists "catalogos_update_anon" on storage.objects;
create policy "catalogos_update_anon"
    on storage.objects for update
    to anon
    using (bucket_id = 'catalogos');

-- Tabela para guardar quais itens do menu lateral cada usuário fixou
-- (funcionalidade "fixar no topo" do menu lateral).

create table if not exists menu_itens_fixados_usuarios (
    username text primary key,
    itens_fixados jsonb not null default '[]'::jsonb,
    atualizado_em timestamptz not null default now()
);

alter table menu_itens_fixados_usuarios enable row level security;

-- Qualquer usuário autenticado (anon key do app) pode ler/gravar sua
-- própria preferência. O app já filtra por username no client, e não
-- há dado sensível aqui (só uma lista de chaves de abas do menu).
drop policy if exists "menu_itens_fixados_usuarios_all" on menu_itens_fixados_usuarios;
create policy "menu_itens_fixados_usuarios_all"
    on menu_itens_fixados_usuarios
    for all
    using (true)
    with check (true);

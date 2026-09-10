-- ============================================================
-- WHEEL TECH  ·  Usuários no banco de dados
-- ------------------------------------------------------------
-- Rode este arquivo INTEIRO uma única vez no
-- Supabase  ->  SQL Editor  ->  New query  ->  colar  ->  Run
--
-- O que ele faz:
--   1. Cria a tabela `usuarios`
--   2. Bloqueia a leitura das senhas (coluna senha_hash nunca sai no SELECT)
--   3. Cria a função de login `verificar_login`
--   4. Insere os 10 usuários que já existem hoje, com os MESMOS nomes.
--      Nenhum registro histórico (OS, chamados, etc.) é alterado.
--   5. Marca `hosama` e `andressa` como bloqueados.
-- ============================================================


-- 1) TABELA --------------------------------------------------
-- Cria a tabela se não existir...
create table if not exists public.usuarios (
    id uuid primary key default gen_random_uuid()
);

-- ...e garante TODAS as colunas (caso já exista uma tabela `usuarios`
-- antiga com outro formato, isto só adiciona o que falta, sem apagar nada).
alter table public.usuarios add column if not exists username      text;
alter table public.usuarios add column if not exists nome          text;
alter table public.usuarios add column if not exists senha_hash    text;   -- SHA-256 salgado (nunca a senha real)
alter table public.usuarios add column if not exists avatar        text;   -- letra do círculo (ex.: 'A')
alter table public.usuarios add column if not exists avatar_foto   text;   -- foto em base64 (data:image/...) [opcional]
alter table public.usuarios add column if not exists role          text;
alter table public.usuarios add column if not exists status        text;   -- ativo | pendente | recusado | bloqueado
alter table public.usuarios add column if not exists email         text;
alter table public.usuarios add column if not exists criado_em     timestamptz default now();
alter table public.usuarios add column if not exists aprovado_por  text;
alter table public.usuarios add column if not exists aprovado_em   timestamptz;
alter table public.usuarios add column if not exists atualizado_em timestamptz default now();

alter table public.usuarios alter column role   set default 'Assistente';
alter table public.usuarios alter column status set default 'pendente';

update public.usuarios set status = 'pendente' where status is null;
update public.usuarios set role   = 'Assistente' where role is null;

-- username único (necessário para o "on conflict" mais abaixo)
create unique index if not exists usuarios_username_uidx on public.usuarios (username);
create index if not exists idx_usuarios_status on public.usuarios (status);


-- 2) PERMISSÕES DE COLUNA ----------------------------------
-- O site usa a chave pública (anon). Tiramos todo o acesso e
-- devolvemos só o necessário. `senha_hash` NÃO entra no SELECT,
-- então ninguém consegue ler os hashes pelo navegador.
revoke all on public.usuarios from anon, authenticated;

grant select (id, username, nome, avatar, avatar_foto, role, status, email,
              criado_em, aprovado_por, aprovado_em)
    on public.usuarios to anon, authenticated;

grant insert (username, nome, senha_hash, avatar, email, status)
    on public.usuarios to anon, authenticated;

grant update (nome, avatar, avatar_foto, role, status, senha_hash,
              aprovado_por, aprovado_em, atualizado_em)
    on public.usuarios to anon, authenticated;


-- 3) RLS ----------------------------------------------------
alter table public.usuarios enable row level security;

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios
    for select using (true);

-- quem se cadastra pelo login só consegue criar linha "pendente"
drop policy if exists usuarios_insert_pendente on public.usuarios;
create policy usuarios_insert_pendente on public.usuarios
    for insert with check (status = 'pendente');

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios
    for update using (true) with check (true);


-- 4) FUNÇÃO DE LOGIN --------------------------------------
-- Recebe o hash calculado no navegador e devolve a linha do
-- usuário só quando o hash bate. O site decide o que fazer com
-- o status (ativo / pendente / recusado / bloqueado).
create or replace function public.verificar_login(p_username text, p_senha_hash text)
returns table (
    id uuid, username text, nome text, avatar text,
    avatar_foto text, role text, status text, email text
)
language sql
security definer
set search_path = public
as $$
    select u.id, u.username, u.nome, u.avatar,
           u.avatar_foto, u.role, u.status, u.email
    from public.usuarios u
    where u.username = lower(p_username)
      and u.senha_hash is not null
      and u.senha_hash = p_senha_hash
    limit 1;
$$;

grant execute on function public.verificar_login(text, text) to anon, authenticated;


-- 5) USUÁRIOS QUE JÁ EXISTEM -----------------------------
-- Mesmos nomes de sempre. As senhas continuam as mesmas de hoje
-- (o hash abaixo corresponde à senha atual de cada um).
insert into public.usuarios (username, nome, senha_hash, avatar, role, status) values
 ('elaine',         'Elaine',   'fe3a2af56cab3e4ff77a4e916acd893dabdab798725e061b5d4a56208d6c7823', 'E', 'Fotógrafa',     'ativo'),
 ('arthur',         'Arthur',   '3e9d717d96651da5c228b1603ee6d179797fe8a503b5123722ed341a66d6e339', 'A', 'Comercial',     'ativo'),
 ('laura',          'Laura',    '1bf6cb2c1dc54cc3b32f0e486d969ec04baf1406698f75526548d4f9b4aa50af', 'L', 'Midia',         'ativo'),
 ('ronald',         'Ronald',   'fb5d99d5f3081cfba694a74e223ddd99e81ee2d868b77360ecf767f128b6ca99', 'R', 'Administrador', 'ativo'),
 ('bruna',          'Bruna',    '7ea4eb7464bc2f0ac65b8e8e02f46dd27a6ce40ee9de477c5fa4cd5f379e68d0', 'B', 'Assistente',    'ativo'),
 ('mirella',        'Mirella',  '1e8a39136d6e6de595294033f8a92c8cdd424cdae475f9a66b3e2f23259cb554', 'M', 'Assistente 2',  'ativo'),
 ('thalyta',        'Thalyta',  '12bcc743966ed6703ac561ced56e229df94b82dcbcba456ff1df82b73af26200', 'T', 'Assistente 3',  'ativo'),
 ('suelen',         'Suelen',   'b8d0c41130093c41a8af91b0dd5a468a0147f1694d8bcd9e375fdb6ac064b275', 'S', 'Assistente 4',  'ativo'),
 ('leticia',        'Leticia',  'a4276b1d7bcf86eac8e3f9bccbcffa5b1940312ac8f133fa2088432b2374f1f0', 'L', 'Administrador', 'ativo'),
 ('andressamiotto', 'Andressa', '18e0a388ede7fe43101e489cac7db884b6a3653e23915f672ea8a3b4a9ea67ba', 'A', 'Administrador', 'ativo')
on conflict (username) do nothing;


-- 6) USUÁRIOS BLOQUEADOS --------------------------------
insert into public.usuarios (username, nome, avatar, role, status) values
 ('hosama',   'Hosama',   'H', 'Assistente', 'bloqueado'),
 ('andressa', 'Andressa (antigo)', 'A', 'Assistente', 'bloqueado')
on conflict (username) do nothing;


-- PRONTO. Pode fechar. O site já vai usar essa tabela no próximo F5.

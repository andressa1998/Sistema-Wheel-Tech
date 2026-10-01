-- ================================================================
-- HORAS EXTRAS — WHEEL TECH
-- ================================================================
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).
--
-- Salário é dado sensível: cada pessoa só pode ver o PRÓPRIO valor.
-- Como o login do sistema não usa o Supabase Auth (o navegador fala
-- com o banco usando a chave pública), filtrar só na tela não basta —
-- qualquer um abriria o DevTools e leria a tabela inteira. Por isso:
--
--   1. As tabelas ficam com RLS ligado e SEM nenhuma política:
--      a chave pública não consegue ler nem gravar nada nelas.
--   2. Todo acesso passa por funções SECURITY DEFINER (he_*), que
--      exigem um token. O token só é emitido por he_abrir_sessao(),
--      que confere usuário + hash da senha na tabela usuarios.
--   3. O servidor descobre quem é o usuário pelo token — nunca pelo
--      que o navegador diz. Funções de admin conferem a tabela
--      he_admins (também trancada).
--
-- Cálculo:  valor_hora = salario_base / carga_horaria_mensal (220 = CLT)
--           valor      = horas * valor_hora * (1 + percentual / 100)
-- O valor da hora é gravado em cada lançamento: aumentar o salário
-- depois não muda horas que já foram lançadas.
--
-- DSR (reflexo das horas extras no descanso semanal remunerado,
-- Súmula 172 TST), calculado mês a mês:
--           dsr = valor_he_do_mes / dias_uteis * dias_de_descanso
-- Dias úteis = segunda a sábado que não sejam feriado. Descanso =
-- domingos + feriados. Feriados nacionais são calculados sozinhos;
-- feriados municipais/estaduais vão na tabela he_feriados (pela tela).
-- O DSR não é gravado: é recalculado, então cadastrar um feriado
-- depois corrige o mês automaticamente.
--
-- Pode rodar este arquivo de novo sempre que ele mudar: tudo aqui é
-- "if not exists" / "create or replace" e não apaga dados.
-- ================================================================

-- ---------- TABELAS ----------

create table if not exists public.he_salarios (
    username              text primary key,
    salario_base          numeric(12,2) not null check (salario_base >= 0),
    carga_horaria_mensal  numeric(6,2)  not null default 220 check (carga_horaria_mensal > 0),
    atualizado_em         timestamptz   not null default now(),
    atualizado_por        text
);

create table if not exists public.he_lancamentos (
    id            bigint generated always as identity primary key,
    username      text          not null,
    data          date          not null,
    minutos       integer       not null check (minutos > 0 and minutos <= 24 * 60),
    percentual    numeric(6,2)  not null default 50 check (percentual >= 0),
    valor_hora    numeric(12,4) not null,
    valor         numeric(12,2) not null,
    observacao    text,
    pago          boolean       not null default false,
    pago_em       timestamptz,
    pago_por      text,
    criado_por    text,
    criado_em     timestamptz   not null default now()
);
create index if not exists he_lancamentos_username_data_idx
    on public.he_lancamentos (username, data desc);

create table if not exists public.he_tokens (
    token      text primary key,
    username   text        not null,
    criado_em  timestamptz not null default now(),
    expira_em  timestamptz not null
);

-- Quem pode definir salários e lançar horas. Fica no banco (e não no
-- campo role de usuarios) para não depender de nada que o navegador
-- consiga alterar. Para incluir alguém:
--   insert into public.he_admins (username) values ('fulano');
create table if not exists public.he_admins (
    username text primary key
);
insert into public.he_admins (username) values ('andressamiotto'), ('ronald')
on conflict do nothing;

-- Feriados municipais / estaduais (os nacionais são calculados).
create table if not exists public.he_feriados (
    data       date primary key,
    descricao  text not null
);

-- ---------- TRANCAR AS TABELAS ----------

alter table public.he_salarios    enable row level security;
alter table public.he_lancamentos enable row level security;
alter table public.he_tokens      enable row level security;
alter table public.he_admins      enable row level security;
alter table public.he_feriados    enable row level security;

revoke all on public.he_salarios, public.he_lancamentos, public.he_tokens, public.he_admins, public.he_feriados
    from anon, authenticated;

-- ---------- CALENDÁRIO (DSR) ----------

-- Domingo de Páscoa (algoritmo de Meeus/Butcher)
create or replace function public.he_pascoa(p_ano integer)
returns date
language plpgsql
immutable
as $$
declare
    a int := p_ano % 19;
    b int := p_ano / 100;
    c int := p_ano % 100;
    d int := b / 4;
    e int := b % 4;
    f int := (b + 8) / 25;
    g int := (b - f + 1) / 3;
    h int := (19 * a + b - d - g + 15) % 30;
    i int := c / 4;
    k int := c % 4;
    l int := (32 + 2 * e + 2 * i - h - k) % 7;
    m int := (a + 11 * h + 22 * l) / 451;
begin
    return make_date(p_ano, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end;
$$;

-- Nome do feriado (nacional ou cadastrado) ou null
create or replace function public.he_feriado(p_data date)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        case to_char(p_data, 'MM-DD')
            when '01-01' then 'Confraternização Universal'
            when '04-21' then 'Tiradentes'
            when '05-01' then 'Dia do Trabalho'
            when '09-07' then 'Independência'
            when '10-12' then 'Nossa Senhora Aparecida'
            when '11-02' then 'Finados'
            when '11-15' then 'Proclamação da República'
            when '11-20' then 'Consciência Negra'
            when '12-25' then 'Natal'
        end,
        case when p_data = he_pascoa(extract(year from p_data)::int) - 2 then 'Sexta-feira Santa' end,
        (select descricao from he_feriados where data = p_data)
    );
$$;

-- Dias úteis e dias de descanso do mês da data informada
create or replace function public.he_dias_mes(p_data date, out dias_uteis integer, out dias_descanso integer)
language sql
stable
security definer
set search_path = public
as $$
    select count(*) filter (where not descanso)::int,
           count(*) filter (where descanso)::int
      from (
            select extract(dow from d) = 0 or he_feriado(d::date) is not null as descanso
              from generate_series(date_trunc('month', p_data),
                                   date_trunc('month', p_data) + interval '1 month - 1 day',
                                   interval '1 day') d
      ) x;
$$;

-- Fator do DSR do mês: valor_he * fator = dsr
create or replace function public.he_fator_dsr(p_data date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(dias_descanso::numeric / nullif(dias_uteis, 0), 0)
      from he_dias_mes(p_data);
$$;

-- Lançamentos de uma pessoa com o DSR de cada um
create or replace function public.he_lancamentos_json(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(
               to_jsonb(l) || jsonb_build_object('valor_dsr', round(l.valor * he_fator_dsr(l.data), 2))
               order by l.data desc, l.id desc
           ), '[]'::jsonb)
      from he_lancamentos l
     where l.username = p_username;
$$;

-- Dias úteis / descanso / feriados de cada mês que tem lançamento
create or replace function public.he_meses_json(p_username text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
               'mes', to_char(m.mes, 'YYYY-MM'),
               'dias_uteis', dm.dias_uteis,
               'dias_descanso', dm.dias_descanso,
               'feriados', (
                    select coalesce(jsonb_agg(jsonb_build_object('data', d::date, 'nome', he_feriado(d::date)) order by d), '[]'::jsonb)
                      from generate_series(m.mes, m.mes + interval '1 month - 1 day', interval '1 day') d
                     where he_feriado(d::date) is not null
               )
           ) order by m.mes desc), '[]'::jsonb)
      from (select distinct date_trunc('month', data)::date as mes from he_lancamentos where username = p_username) m
      cross join lateral he_dias_mes(m.mes) dm;
$$;

revoke execute on function public.he_feriado(date)            from public, anon, authenticated;
revoke execute on function public.he_dias_mes(date)           from public, anon, authenticated;
revoke execute on function public.he_fator_dsr(date)          from public, anon, authenticated;
revoke execute on function public.he_lancamentos_json(text)   from public, anon, authenticated;
revoke execute on function public.he_meses_json(text)         from public, anon, authenticated;

-- ---------- FUNÇÕES INTERNAS (não chamáveis pelo navegador) ----------

create or replace function public.he_usuario_do_token(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user text;
begin
    select t.username into v_user
      from he_tokens t
      join usuarios u on lower(u.username) = t.username
     where t.token = p_token
       and t.expira_em > now()
       and coalesce(u.status, 'ativo') = 'ativo';

    if v_user is null then
        raise exception 'SESSAO_HE_INVALIDA' using errcode = '28000';
    end if;
    return v_user;
end;
$$;

create or replace function public.he_exigir_admin(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user text := he_usuario_do_token(p_token);
begin
    if not exists (select 1 from he_admins where username = v_user) then
        raise exception 'SEM_PERMISSAO_HE' using errcode = '42501';
    end if;
    return v_user;
end;
$$;

revoke execute on function public.he_usuario_do_token(text) from public, anon, authenticated;
revoke execute on function public.he_exigir_admin(text)     from public, anon, authenticated;

-- ---------- SESSÃO ----------

create or replace function public.he_abrir_sessao(p_username text, p_senha_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  text;
    v_token text;
begin
    select lower(u.username) into v_user
      from usuarios u
     where lower(u.username) = lower(trim(p_username))
       and u.senha_hash = p_senha_hash
       and coalesce(u.status, 'ativo') = 'ativo';

    if v_user is null then
        raise exception 'Usuário ou senha inválidos.' using errcode = '28000';
    end if;

    delete from he_tokens where expira_em < now();

    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into he_tokens (token, username, expira_em)
    values (v_token, v_user, now() + interval '12 hours');

    return v_token;
end;
$$;

create or replace function public.he_encerrar_sessao(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
    delete from he_tokens where token = p_token;
$$;

-- ---------- FUNCIONÁRIO: SÓ OS PRÓPRIOS DADOS ----------

create or replace function public.he_meu_resumo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user text := he_usuario_do_token(p_token);
begin
    return jsonb_build_object(
        'username', v_user,
        'eh_admin', exists (select 1 from he_admins where username = v_user),
        'salario', (
            select jsonb_build_object(
                'salario_base', s.salario_base,
                'carga_horaria_mensal', s.carga_horaria_mensal,
                'atualizado_em', s.atualizado_em
            )
              from he_salarios s
             where s.username = v_user
        ),
        'lancamentos', coalesce((
            select jsonb_agg(to_jsonb(l) order by l.data desc, l.id desc)
              from he_lancamentos l
             where l.username = v_user
        ), '[]'::jsonb)
    );
end;
$$;

-- ---------- ADMIN ----------

create or replace function public.he_admin_painel(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform he_exigir_admin(p_token);

    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'username', lower(u.username),
                   'nome', coalesce(u.nome, u.username),
                   'salario_base', s.salario_base,
                   'carga_horaria_mensal', s.carga_horaria_mensal,
                   'minutos_pendentes', coalesce(t.minutos_pendentes, 0),
                   'a_receber', coalesce(t.a_receber, 0),
                   'pago', coalesce(t.pago, 0)
               ) order by coalesce(u.nome, u.username))
          from usuarios u
          left join he_salarios s on s.username = lower(u.username)
          left join (
                select username,
                       sum(minutos) filter (where not pago) as minutos_pendentes,
                       sum(valor)   filter (where not pago) as a_receber,
                       sum(valor)   filter (where pago)     as pago
                  from he_lancamentos
                 group by username
          ) t on t.username = lower(u.username)
         where coalesce(u.status, 'ativo') = 'ativo'
    ), '[]'::jsonb);
end;
$$;

create or replace function public.he_admin_lancamentos(p_token text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    perform he_exigir_admin(p_token);

    return coalesce((
        select jsonb_agg(to_jsonb(l) order by l.data desc, l.id desc)
          from he_lancamentos l
         where l.username = lower(trim(p_username))
    ), '[]'::jsonb);
end;
$$;

create or replace function public.he_admin_definir_salario(
    p_token text, p_username text, p_salario_base numeric, p_carga_horaria_mensal numeric default 220
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin text := he_exigir_admin(p_token);
    v_user  text := lower(trim(p_username));
begin
    if not exists (select 1 from usuarios where lower(username) = v_user) then
        raise exception 'Usuário não encontrado.';
    end if;
    if p_salario_base is null or p_salario_base < 0 then
        raise exception 'Salário inválido.';
    end if;
    if p_carga_horaria_mensal is null or p_carga_horaria_mensal <= 0 then
        raise exception 'Carga horária inválida.';
    end if;

    insert into he_salarios (username, salario_base, carga_horaria_mensal, atualizado_em, atualizado_por)
    values (v_user, round(p_salario_base, 2), p_carga_horaria_mensal, now(), v_admin)
    on conflict (username) do update
       set salario_base         = excluded.salario_base,
           carga_horaria_mensal = excluded.carga_horaria_mensal,
           atualizado_em        = excluded.atualizado_em,
           atualizado_por       = excluded.atualizado_por;
end;
$$;

create or replace function public.he_admin_lancar(
    p_token text, p_username text, p_data date, p_minutos integer,
    p_percentual numeric default 50, p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin      text := he_exigir_admin(p_token);
    v_user       text := lower(trim(p_username));
    v_sal        he_salarios%rowtype;
    v_valor_hora numeric;
begin
    select * into v_sal from he_salarios where username = v_user;
    if not found then
        raise exception 'Defina o salário base dessa pessoa antes de lançar horas.';
    end if;
    if p_data is null then
        raise exception 'Informe a data.';
    end if;
    if p_minutos is null or p_minutos <= 0 or p_minutos > 24 * 60 then
        raise exception 'Quantidade de horas inválida.';
    end if;
    if p_percentual is null or p_percentual < 0 then
        raise exception 'Percentual inválido.';
    end if;

    v_valor_hora := v_sal.salario_base / v_sal.carga_horaria_mensal;

    insert into he_lancamentos (username, data, minutos, percentual, valor_hora, valor, observacao, criado_por)
    values (
        v_user, p_data, p_minutos, p_percentual, round(v_valor_hora, 4),
        round(p_minutos / 60.0 * v_valor_hora * (1 + p_percentual / 100), 2),
        nullif(trim(p_observacao), ''), v_admin
    );
end;
$$;

create or replace function public.he_admin_excluir_lancamento(p_token text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform he_exigir_admin(p_token);
    delete from he_lancamentos where id = p_id;
end;
$$;

create or replace function public.he_admin_marcar_pago(p_token text, p_ids bigint[], p_pago boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_admin text := he_exigir_admin(p_token);
begin
    update he_lancamentos
       set pago     = p_pago,
           pago_em  = case when p_pago then now() else null end,
           pago_por = case when p_pago then v_admin else null end
     where id = any (p_ids);
end;
$$;

-- Funções públicas (o navegador chama via supabase.rpc)
grant execute on function public.he_abrir_sessao(text, text)                                   to anon, authenticated;
grant execute on function public.he_encerrar_sessao(text)                                      to anon, authenticated;
grant execute on function public.he_meu_resumo(text)                                           to anon, authenticated;
grant execute on function public.he_admin_painel(text)                                         to anon, authenticated;
grant execute on function public.he_admin_lancamentos(text, text)                              to anon, authenticated;
grant execute on function public.he_admin_definir_salario(text, text, numeric, numeric)        to anon, authenticated;
grant execute on function public.he_admin_lancar(text, text, date, integer, numeric, text)     to anon, authenticated;
grant execute on function public.he_admin_excluir_lancamento(text, bigint)                     to anon, authenticated;
grant execute on function public.he_admin_marcar_pago(text, bigint[], boolean)                 to anon, authenticated;

notify pgrst, 'reload schema';

-- Sessões ativas: quem está conectado e desconexão manual por administradores.
create table if not exists sessoes_ativas (
    session_id text primary key,
    username text not null,
    user_name text,
    ip_address text,
    user_agent text,
    login_time timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    encerrada_em timestamptz,
    revogada_em timestamptz,
    revogada_por text
);

create index if not exists sessoes_ativas_last_seen_idx on sessoes_ativas (last_seen desc);
create index if not exists sessoes_ativas_username_idx on sessoes_ativas (username);

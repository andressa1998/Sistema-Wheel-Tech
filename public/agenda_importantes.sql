-- Agenda semanal: cada usuário escolhe quais TÍTULOS de atividade são
-- importantes pra ele. Na tela dele, todos os itens com esses títulos
-- aparecem destacados.

create table if not exists agenda_titulos_importantes (
    username text primary key,
    titulos jsonb not null default '[]'::jsonb,
    atualizado_em timestamptz not null default now()
);

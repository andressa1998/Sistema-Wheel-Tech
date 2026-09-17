-- Sugestões de Melhoria — migração para virar módulo próprio
--
-- Reaproveita a tabela feedback_sugestoes já existente (as
-- sugestões que já estavam lá continuam valendo, só ganham os
-- novos campos). O módulo antigo (dentro de Feedback) deixa de
-- criar/exibir sugestões — tudo passa a acontecer no novo módulo.

alter table feedback_sugestoes
    add column if not exists status text not null default 'aguardando', -- aguardando | aprovado | reprovado
    add column if not exists usuario_username text,
    add column if not exists premio text,
    add column if not exists premio_adicional text,
    add column if not exists avaliado_por text,
    add column if not exists avaliado_em timestamptz;

create index if not exists idx_feedback_sugestoes_status on feedback_sugestoes(status);
create index if not exists idx_feedback_sugestoes_usuario_username on feedback_sugestoes(usuario_username);

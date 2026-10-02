-- Inscrição Estadual do cliente (destinatário da NF-e avulsa).
-- Texto para preservar zeros à esquerda e aceitar "ISENTO".
-- Rodar uma vez no SQL Editor do Supabase.
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS inscricao_estadual text;

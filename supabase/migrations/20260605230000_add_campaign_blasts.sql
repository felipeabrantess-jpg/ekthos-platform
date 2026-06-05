-- Migration: campaign_blasts + campaign_blast_sends
-- Feature: Disparo em massa faseado (campanha com vídeo)
-- Branch: feat/campanha-blast

-- ── Tabela principal: uma por campanha ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_blasts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id               uuid        NOT NULL,
  created_by              uuid,
  title                   text        NOT NULL DEFAULT 'Campanha',
  message_text            text,
  video_url               text,
  instance_id             text        NOT NULL,
  instance_token          text        NOT NULL,
  batch_size              int         NOT NULL DEFAULT 10,
  batch_interval_seconds  int         NOT NULL DEFAULT 180,
  status                  text        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
  total_recipients        int         DEFAULT 0,
  sent_count              int         DEFAULT 0,
  failed_count            int         DEFAULT 0,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

COMMENT ON TABLE  public.campaign_blasts IS
  'Campanhas de disparo em massa faseado (WhatsApp). Uma linha por campanha.';
COMMENT ON COLUMN public.campaign_blasts.instance_id    IS 'Instance ID Z-API do número usado no disparo.';
COMMENT ON COLUMN public.campaign_blasts.instance_token IS 'Token Z-API do número (não é Client-Token).';
COMMENT ON COLUMN public.campaign_blasts.batch_interval_seconds IS
  'Pausa em segundos entre cada lote (anti-ban). Padrão 180s = 3 min.';

-- ── Tabela de envios: uma linha por destinatário ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_blast_sends (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id        uuid        NOT NULL REFERENCES public.campaign_blasts(id) ON DELETE CASCADE,
  church_id       uuid        NOT NULL,
  person_id       uuid,                       -- pode ser null se phone sem cadastro
  phone           text        NOT NULL,
  person_name     text,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  zapi_message_id text,
  error_msg       text,
  sent_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

COMMENT ON TABLE  public.campaign_blast_sends IS
  'Log de cada envio individual de uma campanha. Permite retomada e auditoria.';
COMMENT ON COLUMN public.campaign_blast_sends.zapi_message_id IS
  'messageId retornado pela Z-API — prova de entrega.';

-- ── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaign_blast_sends_blast_id
  ON public.campaign_blast_sends (blast_id);

CREATE INDEX IF NOT EXISTS idx_campaign_blast_sends_blast_status
  ON public.campaign_blast_sends (blast_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_blasts_church
  ON public.campaign_blasts (church_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.campaign_blasts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_blast_sends ENABLE ROW LEVEL SECURITY;

-- service_role bypassa tudo (EFs usam service_role)
CREATE POLICY "campaign_blasts_service_all"
  ON public.campaign_blasts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "campaign_blast_sends_service_all"
  ON public.campaign_blast_sends FOR ALL
  USING (auth.role() = 'service_role');

-- Usuário autenticado: só sua própria igreja
CREATE POLICY "campaign_blasts_tenant_all"
  ON public.campaign_blasts FOR ALL
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY "campaign_blast_sends_tenant_all"
  ON public.campaign_blast_sends FOR ALL
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- ── Funções de contagem (chamadas pela EF com service_role) ───────────────────
CREATE OR REPLACE FUNCTION public.increment_blast_sent(p_blast_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.campaign_blasts
  SET sent_count = sent_count + 1, updated_at = now()
  WHERE id = p_blast_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_blast_failed(p_blast_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.campaign_blasts
  SET failed_count = failed_count + 1, updated_at = now()
  WHERE id = p_blast_id;
$$;

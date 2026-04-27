-- =============================================================
-- Migration: contact_requests
-- Data: 2026-04-27
-- Descrição: Persistência de pedidos de contato com consultor.
--   Registro salvo SEMPRE antes do envio de email (best-effort).
--   Admin Ekthos consulta para contato manual quando email falha.
-- =============================================================

CREATE TABLE IF NOT EXISTS contact_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid        NOT NULL REFERENCES churches(id),
  user_id         uuid        NOT NULL REFERENCES auth.users(id),
  pastor_name     text        NOT NULL,
  pastor_email    text        NOT NULL,
  church_name     text        NOT NULL,
  plan_at_request text        NOT NULL,
  context         text        NOT NULL CHECK (context IN ('module', 'plan', 'agent')),
  target_slug     text        NOT NULL,
  origin_page     text,
  email_sent      boolean     NOT NULL DEFAULT false,
  email_sent_at   timestamptz NULL,
  email_error     text        NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'contacted', 'closed')),
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  contacted_at    timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_church     ON contact_requests(church_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_status     ON contact_requests(status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_email_sent ON contact_requests(email_sent);

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_requests_church_read ON contact_requests
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY contact_requests_admin_all ON contact_requests
  FOR ALL USING (is_ekthos_admin());

COMMENT ON TABLE contact_requests IS
  'Pedidos de contato com consultor. Persistido sempre, email é best-effort.';

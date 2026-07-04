-- View pública de igrejas — expõe apenas 4 campos seguros para leitura anônima.
-- Usada pelo branding de subdomínio na tela de login (feat/subdomain-branding).
-- A tabela churches permanece 100% fechada por RLS — esta view é a única
-- superfície de leitura para o role anon.

CREATE OR REPLACE VIEW churches_public AS
  SELECT id, name, slug, logo_url
  FROM churches
  WHERE is_active = true AND deleted_at IS NULL;

GRANT SELECT ON churches_public TO anon, authenticated;

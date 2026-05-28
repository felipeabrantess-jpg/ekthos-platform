-- Migration: auto-cria messaging_config quando nova church é inserida + backfill
-- Aplicada: 2026-05-28 (Onda 2 — segura/independente)
-- NÃO alterar este trigger sem verificar church_whatsapp_channels + provision-channel

-- Função: cria messaging_config padrão para cada nova church
CREATE OR REPLACE FUNCTION create_default_messaging_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO messaging_config (id, church_id, channel, driver, is_active, is_default)
  VALUES (gen_random_uuid(), NEW.id, 'whatsapp', 'mock_internal', true, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger: dispara após INSERT em churches (idempotente)
DROP TRIGGER IF EXISTS after_church_insert ON churches;

CREATE TRIGGER after_church_insert
  AFTER INSERT ON churches
  FOR EACH ROW
  EXECUTE FUNCTION create_default_messaging_config();

-- Backfill: igrejas existentes sem messaging_config
INSERT INTO messaging_config (id, church_id, channel, driver, is_active, is_default)
SELECT
  gen_random_uuid(),
  c.id,
  'whatsapp',
  'mock_internal',
  true,
  true
FROM churches c
LEFT JOIN messaging_config mc ON mc.church_id = c.id
WHERE mc.id IS NULL
ON CONFLICT DO NOTHING;

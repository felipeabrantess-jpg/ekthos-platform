-- ============================================================
-- Adiciona 'chatpro' como provider aceito (02/05/2026)
-- church_whatsapp_channels.channel_type: meta_cloud/zapi/mock → + chatpro
-- agent_channel_routing.channel_type:    meta_cloud/zapi     → + chatpro
-- ============================================================

-- 1. church_whatsapp_channels
ALTER TABLE church_whatsapp_channels
  DROP CONSTRAINT IF EXISTS church_whatsapp_channels_channel_type_check;

ALTER TABLE church_whatsapp_channels
  ADD CONSTRAINT church_whatsapp_channels_channel_type_check
  CHECK (channel_type IN ('meta_cloud', 'zapi', 'chatpro', 'mock'));

-- 2. agent_channel_routing
ALTER TABLE agent_channel_routing
  DROP CONSTRAINT IF EXISTS agent_channel_routing_channel_type_check;

ALTER TABLE agent_channel_routing
  ADD CONSTRAINT agent_channel_routing_channel_type_check
  CHECK (channel_type IN ('meta_cloud', 'zapi', 'chatpro'));

-- ============================================================
-- 20261015130000_igv_media_bucket.sql
--
-- Bucket público e estável para a mídia de acolhimento da IGV (vídeo de boas-vindas do template
-- acolhimento_boasvindas). Motivo: o media id da Meta expira (~30 dias) e é preso ao número; um link HTTPS
-- estável evita a quebra silenciosa (erro 131009 a partir de 19/08/2026).
--
-- - bucket igv-media: público (a Meta busca o arquivo sem credencial), 16 MB (limite da Meta), só video/mp4;
-- - sem policy de escrita para anon/authenticated: somente a service role grava (upload operacional);
-- - idempotente: o bucket e o objeto acolhimento/boasvindas-igv.mp4 já foram criados em 15/10/2026 (sha256
--   c72627f00ebbdfaf7157566510a1059caae9363b173d25cb6118e95401726a7a, cópia original da Meta, sem alteração).
-- Rollback: docs/rollbacks/20261015130000_igv_media_bucket.rollback.sql
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('igv-media', 'igv-media', true, 16777216, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

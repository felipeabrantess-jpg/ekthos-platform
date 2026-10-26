-- Rollback de 20261015130000_igv_media_bucket.sql
-- Remove os objetos e depois o bucket.
DELETE FROM storage.objects WHERE bucket_id = 'igv-media';
DELETE FROM storage.buckets WHERE id = 'igv-media';

-- Enable Realtime for conversation tables
-- Fixes P3: messages sent via WhatsApp now appear live without F5
-- The supabase_realtime publication was empty — no tables had Realtime enabled.

ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_messages;

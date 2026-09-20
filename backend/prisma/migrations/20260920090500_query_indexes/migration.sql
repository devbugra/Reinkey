-- Gerçekte çalışan sorguların indeksleri (denetim defteri, gelir dökümü,
-- makbuz listeleri, katalog tazeliği). Tablolar büyüdükçe bu sorgular
-- indekssiz tam tarama yapıyordu.
CREATE INDEX IF NOT EXISTS "Event_account_id_idx" ON "Event"("account", "id");
CREATE INDEX IF NOT EXISTS "Event_type_channelId_createdAt_idx" ON "Event"("type", "channelId", "createdAt");
CREATE INDEX IF NOT EXISTS "Receipt_createdAt_idx" ON "Receipt"("createdAt");
CREATE INDEX IF NOT EXISTS "Receipt_channelId_createdAt_idx" ON "Receipt"("channelId", "createdAt");
CREATE INDEX IF NOT EXISTS "Resource_lastPaidAt_idx" ON "Resource"("lastPaidAt");

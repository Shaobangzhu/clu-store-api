-- P08 keyset pagination for ADMIN all-order reads. Owner reads already use
-- Order_userId_createdAt_id_idx. Additive only: preserves all existing data/checks.
CREATE INDEX "Order_createdAt_id_idx" ON "Order"("createdAt", "id");

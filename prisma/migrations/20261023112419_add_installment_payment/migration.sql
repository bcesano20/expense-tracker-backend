-- AlterTable
ALTER TABLE "Installment" ADD COLUMN     "isPayed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "walletApplied" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (hand written). Historical installments keep paidAt = NULL and walletApplied = false:
-- they were never paid through the wallet.

-- Debit installments are born paid
UPDATE "Installment" i
SET "isPayed" = true
FROM "Card" c
WHERE c."id" = i."cardId" AND c."type" = 'debit';

-- Credit installments whose payment month is BEFORE the month of this migration are already paid.
-- The current month and the future ones stay unpaid. A migration has no browser, so the month
-- is taken in Buenos Aires time, where the production users are.
UPDATE "Installment"
SET "isPayed" = true
WHERE NOT "isPayed"
  AND ("paymentYear", "paymentMonth") < (
    EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int,
    EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Argentina/Buenos_Aires'))::int
  );

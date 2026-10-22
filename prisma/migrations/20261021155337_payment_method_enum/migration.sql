-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'DEBIT', 'CREDIT', 'OTHER');

-- Add the new column as nullable so the existing rows can be backfilled
ALTER TABLE "Expense" ADD COLUMN "paymentMethodNew" "PaymentMethod";

-- Backfill. A CASE with no ELSE leaves NULL for any unexpected value,
-- which makes the SET NOT NULL below fail instead of losing data silently.
UPDATE "Expense" e
SET "paymentMethodNew" = CASE
  WHEN e."paymentMethod" = 'cash' THEN 'CASH'::"PaymentMethod"
  WHEN e."paymentMethod" = 'transfer' THEN 'TRANSFER'::"PaymentMethod"
  WHEN e."paymentMethod" = 'other' THEN 'OTHER'::"PaymentMethod"
  -- 'card-installments-N' and the older 'card-totalInstallments-N' spelling
  WHEN e."paymentMethod" LIKE 'card-installments-%' THEN 'CREDIT'::"PaymentMethod"
  WHEN e."paymentMethod" LIKE 'card-totalInstallments-%' THEN 'CREDIT'::"PaymentMethod"
  -- 'card' is debit or credit depending on the linked card. A 'card' expense with no
  -- ExpenseCard row (created without a cardId) never touched a card, so it becomes OTHER.
  WHEN e."paymentMethod" = 'card' THEN COALESCE(
    (
      SELECT CASE c."type"
        WHEN 'credit' THEN 'CREDIT'::"PaymentMethod"
        WHEN 'debit' THEN 'DEBIT'::"PaymentMethod"
      END
      FROM "ExpenseCard" ec
      JOIN "Card" c ON c."id" = ec."cardId"
      WHERE ec."expenseId" = e."id"
    ),
    'OTHER'::"PaymentMethod"
  )
END;

-- Every row must be mapped before the old column goes away
ALTER TABLE "Expense" ALTER COLUMN "paymentMethodNew" SET NOT NULL;

-- Swap the columns
ALTER TABLE "Expense" DROP COLUMN "paymentMethod";
ALTER TABLE "Expense" RENAME COLUMN "paymentMethodNew" TO "paymentMethod";

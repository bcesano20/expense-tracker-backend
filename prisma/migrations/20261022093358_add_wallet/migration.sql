-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "walletApplied" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "walletApplied" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Wallet" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
    -- Safety net: the database itself refuses a negative wallet, even if the code has a bug
    CONSTRAINT "Wallet_balance_non_negative" CHECK ("balance" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_accountId_key" ON "Wallet"("accountId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

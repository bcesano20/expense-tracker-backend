-- CreateTable
CREATE TABLE "MonthClosing" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "savings" DECIMAL(12,2) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthClosing_pkey" PRIMARY KEY ("id"),
    -- Safety net: the database itself refuses an impossible month
    CONSTRAINT "MonthClosing_month_valid" CHECK ("month" BETWEEN 1 AND 12)
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthClosing_accountId_month_year_key" ON "MonthClosing"("accountId", "month", "year");

-- AddForeignKey
ALTER TABLE "MonthClosing" ADD CONSTRAINT "MonthClosing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

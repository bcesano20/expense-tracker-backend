-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

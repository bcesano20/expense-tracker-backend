const { PrismaClient, Prisma } = require('@prisma/client');

// Serialize the DECIMAL types into a Number types
Prisma.Decimal.prototype.toJSON = function () {
  return this.toNumber();
};

// Single shared PrismaClient for the whole app (one connection pool)
const prisma = new PrismaClient();

module.exports = prisma;

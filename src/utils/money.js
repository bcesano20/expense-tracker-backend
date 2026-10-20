const { Prisma } = require('@prisma/client');

// Decimal instances are immutable, so one shared zero is safe to reuse as a starting value
const ZERO = new Prisma.Decimal(0);

// Exact sum of a Decimal field over a list of rows. Returns a Prisma.Decimal.
const sumField = (rows, field) => rows.reduce((sum, row) => sum.plus(row[field]), ZERO);

// Splits an amount into `parts` pieces of 2 decimals that add up exactly to the total.
// Every piece is rounded down; the leftover cents go to the LAST piece.
// splitAmount(100, 3) -> [33.33, 33.33, 33.34]
const splitAmount = (amount, parts) => {
  const total = new Prisma.Decimal(amount);
  const count = Number(parts);
  const base = total.div(count).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

  const amounts = Array(count - 1).fill(base);
  amounts.push(total.minus(base.times(count - 1)));
  return amounts;
};

module.exports = { ZERO, sumField, splitAmount };

const { Prisma } = require('@prisma/client');

// Decimal instances are immutable, so one shared zero is safe to reuse as a starting value
const ZERO = new Prisma.Decimal(0);

// Largest value that fits the Decimal(12, 2) columns
const MAX_AMOUNT = new Prisma.Decimal('9999999999.99');

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

// Returns the amount as an exact Prisma.Decimal, or null when it is not a number greater than 0
// (or greater than or equal to 0 with `allowZero`) with at most 2 decimals that fits
// Decimal(12, 2). It never goes through a float.
const parseAmount = (value, { allowZero = false } = {}) => {
  let amount;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    return null;
  }

  const isPositive = allowZero ? amount.gte(0) : amount.gt(0);
  const isValid =
    amount.isFinite() && isPositive && amount.decimalPlaces() <= 2 && amount.lte(MAX_AMOUNT);
  return isValid ? amount : null;
};

module.exports = { ZERO, sumField, splitAmount, parseAmount };

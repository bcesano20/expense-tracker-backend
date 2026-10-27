const { Prisma } = require('@prisma/client');

// Thrown when an operation would leave the wallet (or a debit card) below 0. The central error
// handler in server.js turns it into a 400 whose message says how much is missing.
class InsufficientFundsError extends Error {
  constructor(shortfall, source = 'wallet') {
    super(`Insufficient ${source} funds`);
    this.name = 'InsufficientFundsError';
    this.shortfall = shortfall; // Prisma.Decimal: how much is missing
    this.source = source; // 'wallet' | 'card': which balance was short
  }
}

// Every function takes the transaction client `tx` (never the global prisma) so the wallet
// change is rolled back together with the rest of the operation.
// They return { applied }: false means the account has no wallet, so nothing was touched.
// Callers store that value in `walletApplied` and only revert what was really applied.

// Takes money out of the wallet. The check and the write are ONE statement
// (UPDATE ... WHERE balance >= amount), so two simultaneous requests cannot both pass the check.
const takeFromWallet = async (tx, accountId, amount) => {
  const value = new Prisma.Decimal(amount);

  const { count } = await tx.wallet.updateMany({
    where: { accountId, balance: { gte: value } },
    data: { balance: { decrement: value } },
  });

  if (count > 0) return { applied: true };

  // Nothing was updated: either there is no wallet or it does not have enough money.
  // This read only builds the error message; the decision was already taken by the UPDATE.
  const wallet = await tx.wallet.findUnique({ where: { accountId } });
  if (!wallet) return { applied: false };

  throw new InsufficientFundsError(value.minus(wallet.balance));
};

// Puts money into the wallet.
const putIntoWallet = async (tx, accountId, amount) => {
  const { count } = await tx.wallet.updateMany({
    where: { accountId },
    data: { balance: { increment: new Prisma.Decimal(amount) } },
  });

  return { applied: count > 0 };
};

// Applies a signed change to the wallet: positive puts money in, negative takes it out.
// Handy for edits that move the wallet by a difference (income amount, card top-up).
const changeWallet = (tx, accountId, delta) => {
  const value = new Prisma.Decimal(delta);

  return value.isNegative()
    ? takeFromWallet(tx, accountId, value.abs())
    : putIntoWallet(tx, accountId, value);
};

module.exports = { InsufficientFundsError, takeFromWallet, putIntoWallet, changeWallet };

const { Prisma, PaymentMethod } = require('@prisma/client');

const { NON_CARD_METHODS } = require('../utils/paymentMethod');
const { ZERO, sumField } = require('../utils/money');
const { InsufficientFundsError, takeFromWallet, putIntoWallet } = require('./wallet');
const { findClosedMonths } = require('./monthClosing');

// Where the money of an expense comes from, and how to give it back:
//   CASH / TRANSFER / OTHER -> the wallet (only if the expense was applied to it)
//   DEBIT                   -> the balance of the debit card
//   CREDIT                  -> nothing when it is bought; the user pays its installments later (see
//                              installmentController). Only deleting it refunds the paid ones
//                              that sit in open months.
// Every function takes the transaction client `tx`, so it rolls back with the rest of the operation.

// Takes the amount from a debit card. When `checkBalance` is true (the account has a wallet) the
// card cannot go below 0; the check and the write are ONE statement, like in takeFromWallet.
// Without a wallet the card is decremented with no check, as it has always been.
const takeFromCard = async (tx, cardId, amount, checkBalance) => {
  const value = new Prisma.Decimal(amount);

  if (!checkBalance) {
    await tx.card.update({ where: { id: cardId }, data: { balance: { decrement: value } } });
    return;
  }

  const { count } = await tx.card.updateMany({
    where: { id: cardId, balance: { gte: value } },
    data: { balance: { decrement: value } },
  });

  if (count > 0) return;

  // The UPDATE already decided; this read only builds the "how much is missing" message
  const card = await tx.card.findUnique({ where: { id: cardId }, select: { balance: true } });
  throw new InsufficientFundsError(value.minus(card?.balance ?? ZERO), 'card');
};

// Applies the effect of an expense and says whether it was applied to the wallet (`walletApplied`).
// `trackWallet: false` is for expenses from before the wallet existed: they never touch it.
// For DEBIT, walletApplied means "the account had a wallet", which decides where a later refund
// goes if the card is gone.
const applyExpenseEffect = async (
  tx,
  { accountId, method, amount, cardId, trackWallet = true }
) => {
  if (NON_CARD_METHODS.includes(method)) {
    if (!trackWallet) return { walletApplied: false };

    const { applied } = await takeFromWallet(tx, accountId, amount);
    return { walletApplied: applied };
  }

  if (method === PaymentMethod.DEBIT) {
    const hasWallet = (await tx.wallet.count({ where: { accountId } })) > 0;

    await takeFromCard(tx, cardId, amount, hasWallet);
    return { walletApplied: hasWallet };
  }

  return { walletApplied: false };
};

// Gives back what applyExpenseEffect took. Only what was really applied is reverted.
// `expense` is a stored expense loaded with its `card` link (the ExpenseCard row, or null).
const revertExpenseEffect = async (tx, expense) => {
  if (NON_CARD_METHODS.includes(expense.paymentMethod)) {
    if (expense.walletApplied) {
      await putIntoWallet(tx, expense.accountId, expense.amount);
    }
    return;
  }

  if (expense.paymentMethod === PaymentMethod.DEBIT) {
    const linkedCard = expense.card
      ? await tx.card.findUnique({
          where: { id: expense.card.cardId },
          select: { id: true, isActive: true },
        })
      : null;

    // An active card gets its money back. A card that was cancelled or deleted already gave its
    // balance to the wallet, so the refund goes there instead (when it was tracked). A cancelled
    // card on an account that never had a wallet keeps receiving it, as before.
    if (linkedCard && (linkedCard.isActive || !expense.walletApplied)) {
      await tx.card.update({
        where: { id: linkedCard.id },
        data: { balance: { increment: expense.amount } },
      });
    } else if (expense.walletApplied) {
      await putIntoWallet(tx, expense.accountId, expense.amount);
    }
    return;
  }

  if (expense.paymentMethod === PaymentMethod.CREDIT) {
    // Buying on credit moved nothing; paying its installments did. Give back only the ones that
    // were paid through the wallet. Unpaid ones, and ones paid on an account without a wallet,
    // never took money from it, so there is nothing to return.
    const paidInstallments = await tx.installment.findMany({
      where: { expenseId: expense.id, isPayed: true, walletApplied: true },
      select: { installmentAmount: true, paymentMonth: true, paymentYear: true },
    });

    // The money of an installment that sits in a CLOSED month was spent in that month and stays
    // spent: only the installments of open months go back to the wallet
    const closedMonths = await findClosedMonths(
      tx,
      expense.accountId,
      paidInstallments.map((i) => ({ month: i.paymentMonth, year: i.paymentYear }))
    );
    const isClosed = (i) =>
      closedMonths.some((m) => m.month === i.paymentMonth && m.year === i.paymentYear);

    const paidTotal = sumField(
      paidInstallments.filter((i) => !isClosed(i)),
      'installmentAmount'
    );

    if (paidTotal.gt(0)) {
      await putIntoWallet(tx, expense.accountId, paidTotal);
    }
  }
};

module.exports = { applyExpenseEffect, revertExpenseEffect };

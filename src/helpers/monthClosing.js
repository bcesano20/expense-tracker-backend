const { PaymentMethod } = require('@prisma/client');

const { sumField } = require('../utils/money');
const { getCurrentMonth } = require('../utils/timeZone');

// Thrown when a write would touch a month that was already closed. The central error handler in
// server.js turns it into a 409.
class MonthClosedError extends Error {
  constructor(month, year) {
    super(`Month ${month}/${year} is closed`);
    this.name = 'MonthClosedError';
    this.month = month;
    this.year = year;
  }
}

// Every function takes the client as its first argument: pass the transaction client `tx` inside a
// transaction so the check and the write see the same data.

// The month a stored date belongs to. Dates are saved at midnight UTC (the user picks a day, not
// a time), so the UTC calendar month is the month the user meant, whatever the server clock says.
const monthOfDate = (date) => ({ month: date.getUTCMonth() + 1, year: date.getUTCFullYear() });

// Months compare as a single number, so the year rollover needs no special case
const monthIndex = ({ month, year }) => year * 12 + month;

const previousMonth = ({ month, year }) =>
  month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };

// The same month listed twice (the installments of one purchase) counts once
const uniqueMonths = (months) => [
  ...new Map(months.map(({ month, year }) => [`${year}-${month}`, { month, year }])).values(),
];

// Which of the given months are closed for the account
const findClosedMonths = async (client, accountId, months) => {
  const unique = uniqueMonths(months);
  if (unique.length === 0) return [];

  const closings = await client.monthClosing.findMany({
    where: { accountId, OR: unique.map(({ month, year }) => ({ month, year })) },
    select: { month: true, year: true },
  });

  return closings;
};

// Throws MonthClosedError if ANY of the months is closed
const assertMonthsOpen = async (client, accountId, months) => {
  const closed = await findClosedMonths(client, accountId, months);

  if (closed.length > 0) {
    throw new MonthClosedError(closed[0].month, closed[0].year);
  }
};

// Throws MonthClosedError only if EVERY month is closed. Used to delete a credit expense: while it
// still has an installment in an open month it can be deleted, and only that part is refunded.
const assertSomeMonthOpen = async (client, accountId, months) => {
  const unique = uniqueMonths(months);
  if (unique.length === 0) return;

  const closed = await findClosedMonths(client, accountId, unique);

  if (closed.length === unique.length) {
    throw new MonthClosedError(closed[0].month, closed[0].year);
  }
};

// The savings of a month computed from the data right now (what an OPEN month shows):
//   incomes
//   - expenses that are not credit (cash, transfer, other, debit), by purchase date
//   - credit installments whose payment month is this month
// Credit counts by installment because that is when its money really leaves the wallet. Debit
// installments are left out: the debit expense already counts by its date. Topping up a debit
// card is not an expense. Returns a Prisma.Decimal (negative when expenses are bigger).
const calculateSavings = async (client, accountId, month, year) => {
  // Explicit UTC boundaries: new Date(year, month, 1) would depend on the server's timezone
  const dateInMonth = {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };

  const incomes = await client.income.findMany({
    where: { accountId, date: dateInMonth },
    select: { amount: true },
  });

  const expenses = await client.expense.findMany({
    where: { accountId, date: dateInMonth, paymentMethod: { not: PaymentMethod.CREDIT } },
    select: { amount: true },
  });

  const installments = await client.installment.findMany({
    where: {
      paymentMonth: month,
      paymentYear: year,
      expense: { accountId, paymentMethod: PaymentMethod.CREDIT },
    },
    select: { installmentAmount: true },
  });

  return sumField(incomes, 'amount')
    .minus(sumField(expenses, 'amount'))
    .minus(sumField(installments, 'installmentAmount'));
};

// What the reports show: the stored value for a closed month, the live one for an open month
const getMonthSavings = async (client, accountId, month, year) => {
  const closing = await client.monthClosing.findUnique({
    where: { accountId_month_year: { accountId, month, year } },
  });

  if (closing) {
    return { amount: closing.savings, isClosed: true, closedAt: closing.closedAt, source: 'saved' };
  }

  const amount = await calculateSavings(client, accountId, month, year);
  return { amount, isClosed: false, closedAt: null, source: 'live' };
};

// The month the wallet was activated, in the user's timezone (null when there is no wallet)
const getActivationMonth = async (client, accountId, timeZone) => {
  const wallet = await client.wallet.findUnique({
    where: { accountId },
    select: { createdAt: true },
  });

  return wallet ? getCurrentMonth(timeZone, wallet.createdAt) : null;
};

// The conditions to close a month (design doc), evaluated in the doc's order:
//   1. the month has ended (it is before the current month) and is not before the wallet existed
//   2. the previous month is closed, except in the month the wallet was activated
//   3. every installment that is paid that month has been paid
// `firstFailure` is the code of the first condition that does not hold, or null.
const getClosingStatus = async (client, accountId, month, year, timeZone) => {
  const target = { month, year };
  const current = getCurrentMonth(timeZone);
  const activation = await getActivationMonth(client, accountId, timeZone); // the activation month of the wallet
  const hasWallet = activation !== null;

  const isClosed =
    (await client.monthClosing.findUnique({
      where: { accountId_month_year: { accountId, month, year } },
    })) !== null; // Check that the month is closed with the existant of accountId, Year and month in the corresponding monthClosing instance

  const previous = previousMonth(target); // get the previous month
  const previousIsClosed =
    (await client.monthClosing.findUnique({
      where: { accountId_month_year: { accountId, ...previous } },
    })) !== null; // check if the previous month is closed, just if is inside the period after the wallet activation

  const pendingInstallments = await client.installment.count({
    where: { paymentMonth: month, paymentYear: year, isPayed: false, expense: { accountId } },
  });

  const isActivationMonth = hasWallet && monthIndex(target) === monthIndex(activation);

  const conditions = {
    monthHasEnded: monthIndex(target) < monthIndex(current),
    notBeforeWallet: hasWallet && monthIndex(target) >= monthIndex(activation),
    previousMonthClosed: isActivationMonth || previousIsClosed,
    installmentsPaid: pendingInstallments === 0,
  };

  let firstFailure = null;
  if (!conditions.monthHasEnded) firstFailure = 'MONTH_NOT_ENDED';
  else if (!conditions.notBeforeWallet) firstFailure = 'MONTH_BEFORE_WALLET';
  else if (!conditions.previousMonthClosed) firstFailure = 'PREVIOUS_MONTH_OPEN';
  else if (!conditions.installmentsPaid) firstFailure = 'INSTALLMENTS_UNPAID';

  return {
    hasWallet,
    isClosed,
    conditions,
    pendingInstallments,
    firstFailure,
    canClose: hasWallet && !isClosed && firstFailure === null,
  };
};

module.exports = {
  MonthClosedError,
  monthOfDate,
  findClosedMonths,
  assertMonthsOpen,
  assertSomeMonthOpen,
  calculateSavings,
  getMonthSavings,
  getClosingStatus,
};

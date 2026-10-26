const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { calculateSavings, getMonthSavings, getClosingStatus } = require('../helpers/monthClosing');

// Why a month cannot be closed, and how the API answers it
const BLOCKED_REASONS = {
  WALLET_REQUIRED: { status: 400, message: ERROR_MESSAGES.WALLET_NOT_FOUND },
  MONTH_ALREADY_CLOSED: { status: 409, message: ERROR_MESSAGES.MONTH_ALREADY_CLOSED },
  MONTH_NOT_ENDED: { status: 400, message: ERROR_MESSAGES.MONTH_NOT_ENDED },
  MONTH_BEFORE_WALLET: { status: 400, message: ERROR_MESSAGES.MONTH_BEFORE_WALLET },
  PREVIOUS_MONTH_OPEN: { status: 400, message: ERROR_MESSAGES.PREVIOUS_MONTH_OPEN },
  INSTALLMENTS_UNPAID: { status: 400, message: ERROR_MESSAGES.INSTALLMENTS_UNPAID },
};

// Thrown inside the closing transaction when the month cannot be closed (it is re-checked there,
// because the data may have changed since the first look). The controller answers it.
class ClosingBlockedError extends Error {
  constructor(code, pendingInstallments = 0) {
    super(`Month cannot be closed: ${code}`);
    this.name = 'ClosingBlockedError';
    this.code = code;
    this.pendingInstallments = pendingInstallments;
  }
}

const respondBlocked = (res, error) => {
  const reason = BLOCKED_REASONS[error.code];
  const pending =
    error.code === 'INSTALLMENTS_UNPAID' ? `. Cuotas pendientes: ${error.pendingInstallments}` : '';

  return res.status(reason.status).json({
    success: false,
    error: error.code,
    message: `${reason.message}${pending}`,
  });
};

// Validates the account id and that the account belongs to the logged user. When it does not pass
// it answers the request itself and returns null, so handlers only need `if (!accountId) return;`
const authorizeAccount = async (req, res, rawAccountId) => {
  const accountId = Number(rawAccountId);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.ACCOUNT_ID_REQUIRED,
    });
    return null;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });

  if (!account || account.userId !== req.user.id) {
    res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: ERROR_MESSAGES.MONTH_CLOSING_ACCOUNT_PERMISSION,
    });
    return null;
  }

  return accountId;
};

// Same idea for the month and the year: answers a 400 and returns null when they are not valid
const parseMonthAndYear = (res, rawMonth, rawYear) => {
  const month = Number(rawMonth);
  const year = Number(rawYear);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({
      success: false,
      error: 'INVALID_MONTH',
      message: ERROR_MESSAGES.INVALID_MONTH,
    });
    return null;
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.INVALID_YEAR,
    });
    return null;
  }

  return { month, year };
};

// ============================================
// LIST CLOSED MONTHS (the frontend uses it to mark them and disable their actions)
// ============================================
exports.getMonthClosings = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res, req.query.accountId);
    if (!accountId) return;

    const closings = await prisma.monthClosing.findMany({
      where: { accountId },
      select: { month: true, year: true, savings: true, closedAt: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    res.status(200).json({
      success: true,
      data: closings,
      count: closings.length,
      message: 'Cierres de mes obtenidos',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// PREVIEW: can this month be closed, and what are its savings
// ============================================
exports.getClosingPreview = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res, req.query.accountId);
    if (!accountId) return;

    const period = parseMonthAndYear(res, req.query.month, req.query.year);
    if (!period) return;

    const { month, year } = period;
    const status = await getClosingStatus(prisma, accountId, month, year, req.timeZone);
    const savings = await getMonthSavings(prisma, accountId, month, year);

    res.status(200).json({
      success: true,
      data: { month, year, timeZone: req.timeZone, ...status, savings },
      message: 'Vista previa del cierre de mes',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CLOSE A MONTH: stores its savings and locks it. The wallet is never touched.
// Irreversible: a mistake is corrected by editing the wallet by hand.
// ============================================
exports.closeMonth = async (req, res, next) => {
  try {
    const { accountId: rawAccountId, month: rawMonth, year: rawYear } = req.body ?? {};

    const accountId = await authorizeAccount(req, res, rawAccountId);
    if (!accountId) return;

    const period = parseMonthAndYear(res, rawMonth, rawYear);
    if (!period) return;

    const { month, year } = period;

    // Checking and storing happen in one transaction, so the savings are computed from the same
    // data that was just checked
    const closing = await prisma.$transaction(async (tx) => {
      const status = await getClosingStatus(tx, accountId, month, year, req.timeZone);

      if (!status.hasWallet) throw new ClosingBlockedError('WALLET_REQUIRED');
      if (status.isClosed) throw new ClosingBlockedError('MONTH_ALREADY_CLOSED');
      if (status.firstFailure) {
        throw new ClosingBlockedError(status.firstFailure, status.pendingInstallments);
      }

      const savings = await calculateSavings(tx, accountId, month, year);

      return tx.monthClosing.create({ data: { accountId, month, year, savings } });
    });

    res.status(201).json({
      success: true,
      data: {
        month: closing.month,
        year: closing.year,
        savings: closing.savings,
        closedAt: closing.closedAt,
      },
      message: 'Mes cerrado exitosamente',
    });
  } catch (error) {
    if (error instanceof ClosingBlockedError) {
      return respondBlocked(res, error);
    }

    // Unique constraint violation: two requests closed the same month at the same time
    if (error.code === 'P2002') {
      return respondBlocked(res, new ClosingBlockedError('MONTH_ALREADY_CLOSED'));
    }

    next(error);
  }
};

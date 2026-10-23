const prisma = require('../helpers/prisma');
const { ERROR_MESSAGES } = require('../helpers/constants');
const { takeFromWallet } = require('../helpers/wallet');
const { parseAmount, sumField } = require('../utils/money');
const { getCurrentMonth } = require('../utils/timeZone');

// Thrown inside the payment transaction when the installments are no longer the ones the user
// saw (a double click, or another request paid them first). The controller answers it as a 409.
class InstallmentsChangedError extends Error {
  constructor() {
    super('The installments to pay changed');
    this.name = 'InstallmentsChangedError';
  }
}

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
      message: ERROR_MESSAGES.INSTALLMENTS_ACCOUNT_PERMISSION,
    });
    return null;
  }

  return accountId;
};

// The unpaid installments whose payment month is BEFORE the current month of the user's
// timezone. The installments of the current month are due next month, so they are not included.
const findDueInstallments = async (accountId, timeZone) => {
  const { month, year } = getCurrentMonth(timeZone);

  const installments = await prisma.installment.findMany({
    where: {
      isPayed: false,
      expense: { accountId },
      OR: [{ paymentYear: { lt: year } }, { paymentYear: year, paymentMonth: { lt: month } }],
    },
    select: { id: true, installmentAmount: true },
  });

  return { installments, total: sumField(installments, 'installmentAmount'), month, year };
};

// ============================================
// PREVIEW: what would be paid today
// ============================================
exports.getDueInstallments = async (req, res, next) => {
  try {
    const accountId = await authorizeAccount(req, res, req.query.accountId);
    if (!accountId) return;

    const due = await findDueInstallments(accountId, req.timeZone);

    res.status(200).json({
      success: true,
      data: {
        count: due.installments.length,
        total: due.total,
        month: due.month,
        year: due.year,
        timeZone: req.timeZone,
      },
      message: 'Cuotas vencidas obtenidas',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// PAY: marks every overdue installment as paid and takes their total from the wallet.
// Manual and irreversible: a mistaken payment is fixed by editing the wallet by hand.
// ============================================
exports.payInstallments = async (req, res, next) => {
  try {
    const { accountId: rawAccountId, expectedTotal } = req.body ?? {};

    const accountId = await authorizeAccount(req, res, rawAccountId);
    if (!accountId) return;

    // The total the user confirmed in the modal
    const expected = parseAmount(expectedTotal);

    if (!expected) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT,
      });
    }

    const due = await findDueInstallments(accountId, req.timeZone);

    if (due.installments.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_INSTALLMENTS_DUE',
        message: ERROR_MESSAGES.NO_INSTALLMENTS_DUE,
      });
    }

    // What the user confirmed is no longer what would be paid: make them look again
    if (!due.total.equals(expected)) {
      return res.status(409).json({
        success: false,
        error: 'INSTALLMENTS_CHANGED',
        message: ERROR_MESSAGES.INSTALLMENTS_CHANGED,
      });
    }

    const ids = due.installments.map((installment) => installment.id);

    // Marking and taking the money happen together or not at all
    const walletApplied = await prisma.$transaction(async (tx) => {
      const hasWallet = (await tx.wallet.count({ where: { accountId } })) > 0;

      // Filtering by isPayed: false is what stops a double click: the second request finds the
      // rows already paid, updates fewer than expected, and stops BEFORE touching the wallet.
      const { count } = await tx.installment.updateMany({
        where: { id: { in: ids }, isPayed: false },
        data: { isPayed: true, paidAt: new Date(), walletApplied: hasWallet },
      });

      if (count !== ids.length) throw new InstallmentsChangedError();

      // Without a wallet the installments are only marked as paid. With one, the whole total
      // must be there: if not, this throws InsufficientFundsError and nothing is marked.
      if (hasWallet) {
        await takeFromWallet(tx, accountId, due.total);
      }

      return hasWallet;
    });

    res.status(200).json({
      success: true,
      data: { paidCount: ids.length, total: due.total, walletApplied },
      message: 'Cuotas pagadas exitosamente',
    });
  } catch (error) {
    if (error instanceof InstallmentsChangedError) {
      return res.status(409).json({
        success: false,
        error: 'INSTALLMENTS_CHANGED',
        message: ERROR_MESSAGES.INSTALLMENTS_CHANGED,
      });
    }
    next(error);
  }
};

// const express = require('express');
// const installmentController = require('../controllers/installmentController');
// const authMiddleware = require('../middleware/authMiddleware');

// const router = express.Router();

// router.get('/due', authMiddleware, installmentController.getDueInstallments);
// router.post('/pay', authMiddleware, installmentController.payInstallments);

// module.exports = router;

// server.js
// const installmentsRoutes = require('./routes/installment');
// app.use('/api/installments', installmentsRoutes);

// const { resolveTimeZone } = require('../utils/timeZone');

// // The frontend sends the browser's timezone in the X-Timezone header on every request
// // (Intl.DateTimeFormat().resolvedOptions().timeZone). The server clock is UTC, so this is the
// // only way to know what "the current month" is for the user. Missing or invalid values fall
// // back to the default zone, so this middleware never rejects a request.
// const timeZoneMiddleware = (req, res, next) => {
//   req.timeZone = resolveTimeZone(req.get('x-timezone'));
//   next();
// };

// module.exports = timeZoneMiddleware;
